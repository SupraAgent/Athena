/**
 * Schedule trigger system: cron parser, calendar-to-cron converter,
 * interval calculator, and ScheduleManager for recurring execution.
 *
 * Zero external dependencies — cron parsing is implemented from scratch.
 */
import type {
  ScheduleConfig,
  ScheduleState,
  ScheduleIntervalConfig,
  ScheduleCalendarConfig,
} from "./types";

// ── Cron types ───────────────────────────────────────────────────

export interface CronParts {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

export interface CronField {
  type: "wildcard" | "list";
  values: number[]; // expanded list of matching values
}

// ── Cron aliases ─────────────────────────────────────────────────

const CRON_ALIASES: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

// ── Field ranges ─────────────────────────────────────────────────

const FIELD_RANGES: Record<string, { min: number; max: number }> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
};

// ── Parse a single cron field ────────────────────────────────────

function parseField(expr: string, fieldName: string): CronField {
  const range = FIELD_RANGES[fieldName];
  if (!range) throw new Error(`Unknown field: ${fieldName}`);

  if (expr === "*") {
    const values: number[] = [];
    for (let i = range.min; i <= range.max; i++) values.push(i);
    return { type: "wildcard", values };
  }

  // Handle step on wildcard: */5
  if (expr.startsWith("*/")) {
    const step = parseInt(expr.slice(2), 10);
    if (isNaN(step) || step <= 0) throw new Error(`Invalid step in ${expr}`);
    const values: number[] = [];
    for (let i = range.min; i <= range.max; i += step) values.push(i);
    return { type: "list", values };
  }

  // Handle comma-separated list: 1,3,5
  const parts = expr.split(",");
  const values = new Set<number>();

  for (const part of parts) {
    const trimmed = part.trim();

    // Range with optional step: 1-5 or 1-5/2
    if (trimmed.includes("-")) {
      const [rangePart, stepPart] = trimmed.split("/");
      const [startStr, endStr] = rangePart.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      const step = stepPart ? parseInt(stepPart, 10) : 1;

      if (isNaN(start) || isNaN(end) || isNaN(step)) {
        throw new Error(`Invalid range expression: ${trimmed}`);
      }
      if (start < range.min || end > range.max || start > end) {
        throw new Error(`Range ${start}-${end} out of bounds for ${fieldName} (${range.min}-${range.max})`);
      }

      for (let i = start; i <= end; i += step) values.add(i);
    } else {
      // Single value
      const val = parseInt(trimmed, 10);
      if (isNaN(val) || val < range.min || val > range.max) {
        throw new Error(`Value ${trimmed} out of bounds for ${fieldName} (${range.min}-${range.max})`);
      }
      values.add(val);
    }
  }

  const sorted = Array.from(values).sort((a, b) => a - b);
  return { type: "list", values: sorted };
}

// ── CronParser ───────────────────────────────────────────────────

/**
 * Parse a 5-field cron expression into structured CronParts.
 */
export function parseCronExpression(expr: string): CronParts {
  const normalized = CRON_ALIASES[expr.trim().toLowerCase()] ?? expr.trim();
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${fields.length}: "${expr}"`);
  }

  return {
    minute: parseField(fields[0], "minute"),
    hour: parseField(fields[1], "hour"),
    dayOfMonth: parseField(fields[2], "dayOfMonth"),
    month: parseField(fields[3], "month"),
    dayOfWeek: parseField(fields[4], "dayOfWeek"),
  };
}

// ── Timezone helpers ─────────────────────────────────────────────

/**
 * Get the wall-clock components of a Date in a specific IANA timezone.
 * Uses Intl.DateTimeFormat for zero-dependency timezone resolution.
 */
function getTimezoneComponents(d: Date, timezone: string): {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number; dayOfWeek: number;
} {
  // formatToParts gives us locale-independent numeric parts in the target tz
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };
  let hour = get("hour");
  // Intl hour12:false can return 24 for midnight in some engines
  if (hour === 24) hour = 0;

  // Compute dayOfWeek in the target timezone by constructing a date string
  // and parsing it. We need the weekday in the target tz, not UTC.
  const dowFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const dowStr = dowFmt.format(d);
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dowMap[dowStr] ?? d.getUTCDay();

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
    dayOfWeek,
  };
}

/**
 * Build a Date from wall-clock components in a specific timezone.
 * Approximates by computing the UTC offset at a nearby time, then adjusts.
 */
function dateFromTimezoneComponents(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  timezone: string,
): Date {
  // Build a rough UTC guess, then refine by checking the actual tz offset
  const rough = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const comp = getTimezoneComponents(rough, timezone);
  // Offset in ms between what we wanted and what we got
  const diffMs = (
    (hour - comp.hour) * 3600000 +
    (minute - comp.minute) * 60000 +
    (day - comp.day) * 86400000
  );
  const adjusted = new Date(rough.getTime() + diffMs);
  // Verify and do a second pass if needed (DST edge near transition)
  const verify = getTimezoneComponents(adjusted, timezone);
  if (verify.hour !== hour || verify.minute !== minute || verify.day !== day) {
    const diff2 = (
      (hour - verify.hour) * 3600000 +
      (minute - verify.minute) * 60000 +
      (day - verify.day) * 86400000
    );
    return new Date(adjusted.getTime() + diff2);
  }
  return adjusted;
}

/**
 * Get the next matching date for a cron expression after the given date.
 * When a timezone is provided, cron fields are matched against wall-clock
 * time in that timezone (standard cron behavior). Defaults to UTC.
 */
export function getNextCronDate(expr: string, after: Date, timezone?: string): Date {
  const tz = timezone || "UTC";
  const parts = parseCronExpression(expr);

  // Start scanning from the next minute after `after`
  let d = new Date(after.getTime());
  d.setUTCSeconds(0, 0);
  d = new Date(d.getTime() + 60000); // advance 1 minute

  // Safety: max 4 years of scanning (covers all cron patterns including yearly)
  const maxDate = new Date(after.getTime() + 4 * 365.25 * 24 * 60 * 60 * 1000);

  while (d.getTime() < maxDate.getTime()) {
    const c = getTimezoneComponents(d, tz);

    // Check month
    if (!parts.month.values.includes(c.month)) {
      // Advance to 1st of next month at 00:00 in the target tz
      let nextMonth = c.month + 1;
      let nextYear = c.year;
      if (nextMonth > 12) { nextMonth = 1; nextYear++; }
      d = dateFromTimezoneComponents(nextYear, nextMonth, 1, 0, 0, 0, tz);
      continue;
    }

    // Check day of month and day of week
    const domMatch = parts.dayOfMonth.values.includes(c.day);
    const dowMatch = parts.dayOfWeek.values.includes(c.dayOfWeek);
    const domIsWild = parts.dayOfMonth.type === "wildcard";
    const dowIsWild = parts.dayOfWeek.type === "wildcard";

    let dayMatch: boolean;
    if (domIsWild && dowIsWild) {
      dayMatch = true;
    } else if (domIsWild) {
      dayMatch = dowMatch;
    } else if (dowIsWild) {
      dayMatch = domMatch;
    } else {
      // Both are restricted: OR behavior (standard cron)
      dayMatch = domMatch || dowMatch;
    }

    if (!dayMatch) {
      // Advance to next day at 00:00 in target tz
      d = dateFromTimezoneComponents(c.year, c.month, c.day + 1, 0, 0, 0, tz);
      continue;
    }

    // Check hour
    if (!parts.hour.values.includes(c.hour)) {
      const nextHour = parts.hour.values.find((h) => h > c.hour);
      if (nextHour !== undefined) {
        d = dateFromTimezoneComponents(c.year, c.month, c.day, nextHour, parts.minute.values[0], 0, tz);
      } else {
        // No more matching hours today, advance to next day
        d = dateFromTimezoneComponents(c.year, c.month, c.day + 1, 0, 0, 0, tz);
      }
      continue;
    }

    // Check minute
    if (!parts.minute.values.includes(c.minute)) {
      const nextMin = parts.minute.values.find((m) => m > c.minute);
      if (nextMin !== undefined) {
        d = dateFromTimezoneComponents(c.year, c.month, c.day, c.hour, nextMin, 0, tz);
      } else {
        // No more matching minutes this hour, advance to next hour
        d = dateFromTimezoneComponents(c.year, c.month, c.day, c.hour + 1, 0, 0, tz);
      }
      continue;
    }

    // All fields match — return the UTC instant
    return new Date(d.getTime());
  }

  throw new Error(`No matching cron date found within 4 years for expression: "${expr}"`);
}

/**
 * Preview the next N fire times for a cron expression.
 */
export function getNextNDates(expr: string, n: number, after?: Date, timezone?: string): Date[] {
  const dates: Date[] = [];
  let current = after ?? new Date();
  for (let i = 0; i < n; i++) {
    const next = getNextCronDate(expr, current, timezone);
    dates.push(next);
    current = next;
  }
  return dates;
}

/**
 * Validate a cron expression and return a human-readable description.
 */
export function validateCronExpression(expr: string): { valid: boolean; error?: string; description?: string } {
  try {
    parseCronExpression(expr);
    return { valid: true, description: cronToHumanReadable(expr) };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Convert a cron expression to a human-readable string.
 */
export function cronToHumanReadable(expr: string): string {
  const normalized = CRON_ALIASES[expr.trim().toLowerCase()] ?? expr.trim();
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) return expr;

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = fields;

  // Common patterns
  // Every minute
  if (minExpr === "*" && hourExpr === "*" && domExpr === "*" && monExpr === "*" && dowExpr === "*") {
    return "Every minute";
  }

  // Every N minutes: */N * * * *
  if (minExpr.startsWith("*/") && hourExpr === "*" && domExpr === "*" && monExpr === "*" && dowExpr === "*") {
    const n = parseInt(minExpr.slice(2), 10);
    return `Every ${n} minute${n === 1 ? "" : "s"}`;
  }

  // Every hour at specific minute: N * * * *
  if (!minExpr.includes("*") && !minExpr.includes(",") && !minExpr.includes("-") &&
      hourExpr === "*" && domExpr === "*" && monExpr === "*" && dowExpr === "*") {
    const min = parseInt(minExpr, 10);
    return min === 0 ? "Every hour" : `Every hour at :${String(min).padStart(2, "0")}`;
  }

  // Specific time patterns
  const hasSpecificTime = !minExpr.includes("*") && !hourExpr.includes("*");
  if (hasSpecificTime) {
    const min = parseInt(minExpr, 10);
    const hour = parseInt(hourExpr, 10);
    const timeStr = formatTime(hour, min);

    // Daily: M H * * *
    if (domExpr === "*" && monExpr === "*" && dowExpr === "*") {
      return `Every day at ${timeStr}`;
    }

    // Specific day of week: M H * * D
    if (domExpr === "*" && monExpr === "*" && dowExpr !== "*") {
      const days = describeDaysOfWeek(dowExpr);
      return `${days} at ${timeStr}`;
    }

    // Monthly: M H D * *
    if (domExpr !== "*" && monExpr === "*" && dowExpr === "*") {
      const day = parseInt(domExpr, 10);
      return `Monthly on the ${ordinal(day)} at ${timeStr}`;
    }

    // Yearly: M H D M *
    if (domExpr !== "*" && monExpr !== "*" && dowExpr === "*") {
      const day = parseInt(domExpr, 10);
      const month = parseInt(monExpr, 10);
      return `Yearly on ${monthName(month)} ${day} at ${timeStr}`;
    }
  }

  return `Cron: ${expr}`;
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:${String(minute).padStart(2, "0")} ${period}`;
}

function describeDaysOfWeek(dowExpr: string): string {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Common patterns
  if (dowExpr === "1-5") return "Every weekday";
  if (dowExpr === "0,6") return "Every weekend";

  // Parse the field to get values
  try {
    const field = parseField(dowExpr, "dayOfWeek");
    if (field.values.length === 1) {
      return `Every ${dayNames[field.values[0]]}`;
    }
    if (field.values.length <= 3) {
      return `Every ${field.values.map((v) => dayNames[v]).join(", ")}`;
    }
    return `Every ${field.values.map((v) => shortNames[v]).join(", ")}`;
  } catch {
    return `Day ${dowExpr}`;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function monthName(m: number): string {
  const names = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return names[m] ?? `Month ${m}`;
}

// ── Calendar to cron ─────────────────────────────────────────────

/**
 * Convert a consumer-friendly calendar config to a cron expression.
 */
export function calendarToSchedule(calendar: ScheduleCalendarConfig): string {
  const [hourStr, minStr] = calendar.time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time: ${calendar.time}. Expected HH:mm in 24h format.`);
  }

  switch (calendar.frequency) {
    case "daily":
      return `${minute} ${hour} * * *`;

    case "weekly": {
      const dow = calendar.dayOfWeek ?? 1; // default Monday
      if (dow < 0 || dow > 6) throw new Error(`Invalid dayOfWeek: ${dow}. Must be 0-6.`);
      return `${minute} ${hour} * * ${dow}`;
    }

    case "monthly": {
      const dom = calendar.dayOfMonth ?? 1; // default 1st
      if (dom < 1 || dom > 31) throw new Error(`Invalid dayOfMonth: ${dom}. Must be 1-31.`);
      return `${minute} ${hour} ${dom} * *`;
    }

    case "yearly": {
      const dom = calendar.dayOfMonth ?? 1;
      const month = calendar.month ?? 1; // default January
      if (dom < 1 || dom > 31) throw new Error(`Invalid dayOfMonth: ${dom}. Must be 1-31.`);
      if (month < 1 || month > 12) throw new Error(`Invalid month: ${month}. Must be 1-12.`);
      return `${minute} ${hour} ${dom} ${month} *`;
    }

    default:
      throw new Error(`Unknown calendar frequency: ${calendar.frequency}`);
  }
}

// ── Interval calculation ─────────────────────────────────────────

const UNIT_TO_MS: Record<string, number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

/**
 * Compute the next run time for a simple interval schedule.
 */
export function intervalToNextDate(interval: ScheduleIntervalConfig, lastRun?: Date): Date {
  const ms = interval.value * (UNIT_TO_MS[interval.unit] ?? 60000);
  const base = lastRun ?? new Date();
  return new Date(base.getTime() + ms);
}

// ── ScheduleManager ──────────────────────────────────────────────

interface RegisteredSchedule {
  config: ScheduleConfig;
  state: ScheduleState;
  callback: () => Promise<void>;
  executing: boolean;
}

export type ScheduleFiredCallback = (scheduleId: string, firedAt: Date) => void;

/**
 * ScheduleManager: registers schedule configs and checks every second
 * which schedules need to fire. Handles missed runs, concurrent execution
 * prevention, and max execution caps.
 */
export class ScheduleManager {
  private schedules = new Map<string, RegisteredSchedule>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  public onScheduleFired?: ScheduleFiredCallback;

  /**
   * Register a schedule. Computes the initial nextRunAt.
   */
  register(scheduleId: string, config: ScheduleConfig, callback: () => Promise<void>): void {
    const state: ScheduleState = {
      executionCount: 0,
      isActive: true,
    };

    // Compute initial nextRunAt
    state.nextRunAt = this.computeNextRun(config, undefined);

    this.schedules.set(scheduleId, {
      config,
      state,
      callback,
      executing: false,
    });
  }

  /**
   * Remove a schedule.
   */
  unregister(scheduleId: string): void {
    this.schedules.delete(scheduleId);
  }

  /**
   * Get the state of a specific schedule.
   */
  getState(scheduleId: string): ScheduleState {
    const entry = this.schedules.get(scheduleId);
    if (!entry) {
      return { executionCount: 0, isActive: false };
    }
    return { ...entry.state };
  }

  /**
   * Get all registered schedules with their configs and states.
   */
  getAll(): Array<{ id: string; config: ScheduleConfig; state: ScheduleState }> {
    const result: Array<{ id: string; config: ScheduleConfig; state: ScheduleState }> = [];
    for (const [id, entry] of this.schedules) {
      result.push({ id, config: entry.config, state: { ...entry.state } });
    }
    return result;
  }

  /**
   * Start the check loop (checks every second).
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => this.tick(), 1000);
  }

  /**
   * Stop the check loop.
   */
  stop(): void {
    this.running = false;
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Internal tick: check all schedules and fire any that are due.
   */
  private tick(): void {
    const now = new Date();

    for (const [id, entry] of this.schedules) {
      if (!entry.state.isActive) continue;
      if (entry.executing) continue; // prevent concurrent execution

      // Check max executions cap
      if (entry.config.maxExecutions != null && entry.state.executionCount >= entry.config.maxExecutions) {
        entry.state.isActive = false;
        continue;
      }

      // Check end date
      if (entry.config.endDate) {
        const endDate = new Date(entry.config.endDate);
        if (now.getTime() > endDate.getTime()) {
          entry.state.isActive = false;
          continue;
        }
      }

      // Check start date
      if (entry.config.startDate) {
        const startDate = new Date(entry.config.startDate);
        if (now.getTime() < startDate.getTime()) continue;
      }

      // Check if it's time to fire
      if (!entry.state.nextRunAt) continue;
      const nextRun = new Date(entry.state.nextRunAt);
      if (now.getTime() >= nextRun.getTime()) {
        this.fireSchedule(id, entry, now);
      }
    }
  }

  /**
   * Fire a schedule: execute its callback, update state, compute next run.
   */
  private fireSchedule(id: string, entry: RegisteredSchedule, firedAt: Date): void {
    entry.executing = true;
    entry.state.lastRunAt = firedAt.toISOString();
    entry.state.executionCount++;

    // Compute next run time before executing (so state is available during execution)
    entry.state.nextRunAt = this.computeNextRun(entry.config, firedAt);

    // Check if we've hit maxExecutions after incrementing
    if (entry.config.maxExecutions != null && entry.state.executionCount >= entry.config.maxExecutions) {
      entry.state.isActive = false;
      entry.state.nextRunAt = undefined;
    }

    // Fire the callback asynchronously
    entry.callback()
      .catch(() => {
        // Swallow errors — schedule manager should not crash
      })
      .finally(() => {
        entry.executing = false;
      });

    // Notify listener
    if (this.onScheduleFired) {
      try {
        this.onScheduleFired(id, firedAt);
      } catch {
        // Swallow
      }
    }
  }

  /**
   * Compute the next run time based on the schedule config mode.
   */
  private computeNextRun(config: ScheduleConfig, lastRun: Date | undefined): string | undefined {
    try {
      let cronExpr: string | undefined;

      switch (config.mode) {
        case "interval": {
          if (!config.interval) return undefined;
          const nextDate = intervalToNextDate(config.interval, lastRun);
          return nextDate.toISOString();
        }

        case "cron": {
          cronExpr = config.cronExpression;
          break;
        }

        case "calendar": {
          if (!config.calendar) return undefined;
          cronExpr = calendarToSchedule(config.calendar);
          break;
        }

        default:
          return undefined;
      }

      if (!cronExpr) return undefined;
      const after = lastRun ?? new Date();
      const nextDate = getNextCronDate(cronExpr, after, config.timezone);
      return nextDate.toISOString();
    } catch {
      return undefined;
    }
  }
}

/**
 * Get a human-readable description for any ScheduleConfig.
 */
export function scheduleToHumanReadable(config: ScheduleConfig): string {
  switch (config.mode) {
    case "interval": {
      if (!config.interval) return "No interval configured";
      const { value, unit } = config.interval;
      return `Every ${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;
    }

    case "cron": {
      if (!config.cronExpression) return "No cron expression";
      try {
        return cronToHumanReadable(config.cronExpression);
      } catch {
        return config.cronExpression;
      }
    }

    case "calendar": {
      if (!config.calendar) return "No calendar configured";
      try {
        const cronExpr = calendarToSchedule(config.calendar);
        return cronToHumanReadable(cronExpr);
      } catch {
        return `${config.calendar.frequency} at ${config.calendar.time}`;
      }
    }

    default:
      return "Unknown schedule mode";
  }
}
