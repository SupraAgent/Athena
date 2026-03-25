/**
 * Token Bucket Rate Limiter.
 *
 * Provides a configurable rate limiter using the token bucket algorithm.
 * Designed to be an injectable instance on EngineConfig so consuming apps
 * can share a single limiter across multiple workflow runs (essential for
 * real API rate limits).
 */

// ── Types ────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum tokens in the bucket (capacity). */
  maxTokens: number;
  /** Tokens added per second. */
  refillRate: number;
  /** Interval in ms at which refills are calculated. Default: 1000. */
  refillIntervalMs?: number;
  /** Strategy when no tokens are available. */
  strategy: "wait" | "skip" | "fail";
  /** Per action-type overrides. If an override exists for the action type, a separate bucket is used. */
  perActionOverrides?: Record<string, Partial<RateLimitConfig>>;
}

export interface RateLimitAcquireResult {
  allowed: boolean;
  waitedMs: number;
}

export interface RateLimitStatus {
  availableTokens: number;
  capacity: number;
  nextRefillMs: number;
}

// ── Internal bucket state ────────────────────────────────────────

interface BucketState {
  tokens: number;
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
  lastRefillTime: number;
  strategy: "wait" | "skip" | "fail";
}

// ── Token Bucket Rate Limiter class ──────────────────────────────

const MAX_WAIT_TIMEOUT_MS = 30_000;
const WAIT_POLL_INTERVAL_MS = 50;

export class TokenBucketRateLimiter {
  private readonly defaultBucket: BucketState;
  private readonly actionBuckets: Map<string, BucketState> = new Map();
  private readonly overrides: Record<string, Partial<RateLimitConfig>>;

  constructor(config: RateLimitConfig) {
    this.defaultBucket = createBucket(config);
    this.overrides = config.perActionOverrides ?? {};

    // Pre-create buckets for known action overrides
    for (const [actionType, override] of Object.entries(this.overrides)) {
      const merged = mergeConfig(config, override);
      this.actionBuckets.set(actionType, createBucket(merged));
    }
  }

  /**
   * Attempt to acquire a token. Behavior depends on the strategy:
   * - "wait": waits until a token is available (max 30s timeout)
   * - "skip": returns { allowed: false, waitedMs: 0 } immediately
   * - "fail": throws an Error
   */
  async acquire(actionType?: string): Promise<RateLimitAcquireResult> {
    const bucket = this.getBucket(actionType);
    refillBucket(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      // Clamp to 0 to guard against floating-point drift
      if (bucket.tokens < 0) bucket.tokens = 0;
      return { allowed: true, waitedMs: 0 };
    }

    // No tokens available — apply strategy
    switch (bucket.strategy) {
      case "skip":
        return { allowed: false, waitedMs: 0 };

      case "fail":
        throw new Error(
          `Rate limit exceeded${actionType ? ` for action "${actionType}"` : ""}. ` +
          `No tokens available (capacity: ${bucket.capacity}, refillRate: ${bucket.refillRate}/s).`
        );

      case "wait":
        return this.waitForToken(bucket);
    }
  }

  /**
   * Get current status of the rate limiter bucket.
   */
  getStatus(actionType?: string): RateLimitStatus {
    const bucket = this.getBucket(actionType);
    refillBucket(bucket);

    const timeSinceRefill = Date.now() - bucket.lastRefillTime;
    const nextRefillMs = Math.max(0, bucket.refillIntervalMs - timeSinceRefill);

    return {
      availableTokens: Math.floor(bucket.tokens),
      capacity: bucket.capacity,
      nextRefillMs,
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private getBucket(actionType?: string): BucketState {
    if (actionType && this.actionBuckets.has(actionType)) {
      return this.actionBuckets.get(actionType)!;
    }
    return this.defaultBucket;
  }

  private async waitForToken(bucket: BucketState): Promise<RateLimitAcquireResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_TIMEOUT_MS) {
      // Compute a smarter sleep: wait at least until enough time has elapsed
      // for one token to be refilled, instead of always polling at a fixed 50ms.
      // This reduces CPU cost from ~600 polls/30s to only the polls actually needed.
      const tokensNeeded = 1 - bucket.tokens;
      const msUntilToken = tokensNeeded > 0 && bucket.refillRate > 0
        ? Math.ceil((tokensNeeded / bucket.refillRate) * 1000)
        : WAIT_POLL_INTERVAL_MS;
      const sleepMs = Math.max(WAIT_POLL_INTERVAL_MS, Math.min(msUntilToken, MAX_WAIT_TIMEOUT_MS - (Date.now() - startTime)));

      if (sleepMs <= 0) break;

      await sleep(sleepMs);
      refillBucket(bucket);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { allowed: true, waitedMs: Date.now() - startTime };
      }
    }

    // Timed out waiting for a token — treat as not allowed
    return { allowed: false, waitedMs: Date.now() - startTime };
  }
}

// ── Pure helpers ─────────────────────────────────────────────────

function createBucket(config: RateLimitConfig): BucketState {
  return {
    tokens: config.maxTokens,
    capacity: config.maxTokens,
    refillRate: config.refillRate,
    refillIntervalMs: config.refillIntervalMs ?? 1000,
    lastRefillTime: Date.now(),
    strategy: config.strategy,
  };
}

function mergeConfig(
  base: RateLimitConfig,
  override: Partial<RateLimitConfig>
): RateLimitConfig {
  return {
    maxTokens: override.maxTokens ?? base.maxTokens,
    refillRate: override.refillRate ?? base.refillRate,
    refillIntervalMs: override.refillIntervalMs ?? base.refillIntervalMs,
    strategy: override.strategy ?? base.strategy,
    // Don't propagate nested overrides
  };
}

/**
 * Refill tokens based on elapsed time since last refill.
 * Uses continuous refill: tokens += elapsed * (refillRate / 1000).
 * Clamps to [0, capacity] to prevent overflow or negative tokens.
 */
function refillBucket(bucket: BucketState): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefillTime;

  if (elapsed <= 0) return;

  // Continuous refill: refillRate is tokens/second, elapsed is in ms
  const tokensToAdd = (elapsed / 1000) * bucket.refillRate;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefillTime = now;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
