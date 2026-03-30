/**
 * Competitor scraping channel.
 *
 * Fetches reviews and ratings from Product Hunt, App Store, and custom URLs
 * via Jina Reader (r.jina.ai) for clean markdown extraction.
 * Produces summarized competitor intelligence for SupraLoop benchmarks.
 */

import type {
  ExternalChannel,
  ChannelConfig,
  ChannelFetchResult,
  ChannelMemoryCandidate,
  ChannelStatus,
} from "./channel";

type CompetitorTarget = {
  name: string;
  producthunt_slug?: string;
  appstore_id?: string;
  appstore_country?: string;
  urls?: string[];
};

/** Fetch clean markdown from a URL via Jina Reader. Falls back to raw fetch. */
async function fetchCleanContent(url: string, timeout = 15000): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    return await httpGet(jinaUrl, timeout);
  } catch {
    // Fallback: raw fetch
    try {
      return await httpGet(url, timeout);
    } catch {
      return "";
    }
  }
}

/** Simple HTTPS GET. */
async function httpGet(url: string, timeout = 10000): Promise<string> {
  const mod = url.startsWith("https") ? await import("https") : await import("http");
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method: "GET", timeout, headers: { "User-Agent": "Hermes/1.0" } }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, timeout).then(resolve, reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

/** Extract key themes from review text using simple heuristics. */
function extractThemes(text: string, maxLength = 300): string {
  // Common sentiment/feature keywords
  const negativePatterns = /(?:slow|buggy|crash|broken|missing|confusing|frustrat|terrible|worst|annoying|laggy|unusable)/gi;
  const positivePatterns = /(?:great|love|fast|clean|simple|intuitive|amazing|excellent|beautiful|smooth|helpful|easy)/gi;

  const negatives = new Set<string>();
  const positives = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = negativePatterns.exec(text)) !== null) negatives.add(match[0].toLowerCase());
  while ((match = positivePatterns.exec(text)) !== null) positives.add(match[0].toLowerCase());

  // Extract star ratings if present
  const starMatch = text.match(/(\d(?:\.\d)?)\s*(?:out of\s*5|\/\s*5|stars?)/i);
  const rating = starMatch ? starMatch[1] : null;

  const parts: string[] = [];
  if (rating) parts.push(`Rating: ${rating}/5`);
  if (positives.size > 0) parts.push(`Praise: ${[...positives].slice(0, 5).join(", ")}`);
  if (negatives.size > 0) parts.push(`Complaints: ${[...negatives].slice(0, 5).join(", ")}`);

  if (parts.length === 0) {
    // Fallback: first meaningful lines
    const lines = text.split("\n").filter((l) => l.trim().length > 20).slice(0, 3);
    return lines.join(" ").slice(0, maxLength);
  }

  return parts.join(" — ").slice(0, maxLength);
}

export class CompetitorChannel implements ExternalChannel {
  readonly type = "competitor" as const;

  async check(): Promise<ChannelStatus> {
    // No auth needed for public scraping
    return "available";
  }

  async fetch(config: ChannelConfig): Promise<ChannelFetchResult> {
    const errors: string[] = [];
    const memories: ChannelMemoryCandidate[] = [];
    const opts = config.options;

    const targets = (opts.targets as CompetitorTarget[]) ?? [];
    if (targets.length === 0) {
      return { channel: this.type, memories: [], fetchedAt: new Date().toISOString(), errors: ["No competitor targets configured"] };
    }

    const dateStamp = new Date().toISOString().slice(0, 10);

    for (const target of targets) {
      const sourceParts: string[] = [];

      // Product Hunt reviews
      if (target.producthunt_slug) {
        try {
          const url = `https://www.producthunt.com/products/${target.producthunt_slug}/reviews`;
          const content = await fetchCleanContent(url);
          if (content) sourceParts.push(content);
        } catch (err: unknown) {
          errors.push(`PH ${target.name}: ${String(err).slice(0, 100)}`);
        }
        // Rate limit between targets
        await sleep(1000);
      }

      // App Store reviews
      if (target.appstore_id) {
        try {
          const country = target.appstore_country || "us";
          const url = `https://apps.apple.com/${country}/app/id${target.appstore_id}`;
          const content = await fetchCleanContent(url);
          if (content) sourceParts.push(content);
        } catch (err: unknown) {
          errors.push(`AppStore ${target.name}: ${String(err).slice(0, 100)}`);
        }
        await sleep(1000);
      }

      // Custom URLs
      if (target.urls) {
        for (const url of target.urls.slice(0, 3)) {
          try {
            const content = await fetchCleanContent(url);
            if (content) sourceParts.push(content);
          } catch (err: unknown) {
            errors.push(`URL ${target.name}: ${String(err).slice(0, 100)}`);
          }
          await sleep(1000);
        }
      }

      if (sourceParts.length > 0) {
        const combined = sourceParts.join("\n\n");
        const themes = extractThemes(combined);

        memories.push({
          content: `[Competitor: ${target.name}] ${themes}`,
          tags: ["competitor", "benchmark", target.name.toLowerCase().replace(/\s+/g, "-")],
          relevance: 0.4,
          externalId: `competitor-${target.name.toLowerCase().replace(/\s+/g, "-")}-${dateStamp}`,
        });
      }
    }

    return { channel: this.type, memories, fetchedAt: new Date().toISOString(), errors };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
