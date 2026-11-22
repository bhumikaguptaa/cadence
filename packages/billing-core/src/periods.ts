/**
 * Period math for a spend permission. Mirrors the onchain rules:
 *  - period 0 starts at `start`; each period is `periodSeconds` long (seconds, not calendar months)
 *  - `start` is inclusive and `end` is exclusive
 *  - the allowance resets at each boundary and does NOT roll over, so only the current period can
 *    ever be charged. A missed period is gone; we never "catch up".
 * Time is integer unix seconds everywhere. Nothing here reads the real clock except `systemClock`.
 */

export type UnixSeconds = number;

export const MAX_UINT48 = 2 ** 48 - 1;
const MAX_PERIOD_LIST = 20_000;

export type PeriodsErrorCode =
  | 'INVALID_SCHEDULE'
  | 'PERIOD_OUT_OF_RANGE'
  | 'INVALID_RANGE'
  | 'TOO_MANY_PERIODS'
  | 'INVALID_TIME';

export class PeriodsError extends Error {
  readonly code: PeriodsErrorCode;
  constructor(code: PeriodsErrorCode, message: string) {
    super(message);
    this.name = 'PeriodsError';
    this.code = code;
  }
}

// ---- Clock (injectable) ----

export interface Clock {
  nowSeconds(): UnixSeconds;
}

export const systemClock: Clock = { nowSeconds: () => Math.floor(Date.now() / 1000) };

export type FakeClock = Clock & { advance(seconds: number): void; set(t: UnixSeconds): void };

export function createFakeClock(initial: UnixSeconds): FakeClock {
  assertTime(initial);
  let now = initial;
  return {
    nowSeconds: () => now,
    advance(seconds) {
      assertTime(now + seconds);
      now += seconds;
    },
    set(t) {
      assertTime(t);
      now = t;
    },
  };
}

function assertTime(t: number): void {
  if (!Number.isSafeInteger(t) || t < 0) {
    throw new PeriodsError('INVALID_TIME', 'Time must be a non-negative integer of unix seconds.');
  }
}

// ---- Schedule ----

export type PeriodSchedule = {
  /** Permission start, inclusive. */
  readonly start: UnixSeconds;
  readonly periodSeconds: number;
  /** Permission end, exclusive. Use MAX_UINT48 for "no end". */
  readonly end: UnixSeconds;
};

export type PeriodWindow = {
  readonly index: number;
  readonly start: UnixSeconds;
  /** Nominal end of the period (exclusive). The last period may extend past the permission end. */
  readonly end: UnixSeconds;
  /** Last moment (exclusive) a charge or retry can happen: min(period end, permission end). */
  readonly deadline: UnixSeconds;
};

export function daysToSeconds(days: number): number {
  if (!Number.isInteger(days) || days < 1) {
    throw new PeriodsError('INVALID_SCHEDULE', 'Period must be a whole number of days (>= 1).');
  }
  return days * 86_400;
}

export function assertValidSchedule(s: PeriodSchedule): void {
  const ok =
    Number.isSafeInteger(s.start) &&
    Number.isSafeInteger(s.periodSeconds) &&
    Number.isSafeInteger(s.end) &&
    s.start >= 0 &&
    s.periodSeconds >= 1 &&
    s.end > s.start &&
    s.end <= MAX_UINT48;
  if (!ok) {
    throw new PeriodsError(
      'INVALID_SCHEDULE',
      'Schedule needs integer start >= 0, periodSeconds >= 1, and start < end <= 2^48 - 1.',
    );
  }
}

export type Phase = 'not_started' | 'active' | 'ended';

export function phaseAt(s: PeriodSchedule, t: UnixSeconds): Phase {
  assertValidSchedule(s);
  assertTime(t);
  if (t < s.start) return 'not_started';
  if (t >= s.end) return 'ended';
  return 'active';
}

export function periodWindow(s: PeriodSchedule, index: number): PeriodWindow {
  assertValidSchedule(s);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new PeriodsError('PERIOD_OUT_OF_RANGE', 'Period index must be a non-negative integer.');
  }
  const start = s.start + index * s.periodSeconds;
  if (start >= s.end) {
    throw new PeriodsError(
      'PERIOD_OUT_OF_RANGE',
      `Period ${index} starts after the permission ends.`,
    );
  }
  const end = start + s.periodSeconds;
  return { index, start, end, deadline: Math.min(end, s.end) };
}

/** The period containing `t`, or null if the permission is not active at `t`. */
export function currentPeriod(s: PeriodSchedule, t: UnixSeconds): PeriodWindow | null {
  if (phaseAt(s, t) !== 'active') return null;
  return periodWindow(s, Math.floor((t - s.start) / s.periodSeconds));
}

/** First period boundary strictly after `t` (or the permission start if `t` is earlier). */
export function nextPeriodStart(s: PeriodSchedule, t: UnixSeconds): UnixSeconds | null {
  assertValidSchedule(s);
  assertTime(t);
  const next =
    t < s.start
      ? s.start
      : s.start + (Math.floor((t - s.start) / s.periodSeconds) + 1) * s.periodSeconds;
  return next < s.end ? next : null;
}

/** Period boundaries in [from, to) that fall inside the permission lifetime, ascending. */
export function periodStartsBetween(
  s: PeriodSchedule,
  from: UnixSeconds,
  to: UnixSeconds,
): UnixSeconds[] {
  assertValidSchedule(s);
  assertTime(from);
  assertTime(to);
  if (to < from) throw new PeriodsError('INVALID_RANGE', '"to" must not be before "from".');
  const lo = Math.max(from, s.start);
  const hi = Math.min(to, s.end);
  if (hi <= lo) return [];
  const firstIndex = Math.ceil((lo - s.start) / s.periodSeconds);
  const out: UnixSeconds[] = [];
  for (let i = firstIndex; ; i++) {
    const t = s.start + i * s.periodSeconds;
    if (t >= hi) break;
    if (out.length >= MAX_PERIOD_LIST) {
      throw new PeriodsError('TOO_MANY_PERIODS', `More than ${MAX_PERIOD_LIST} periods in range.`);
    }
    out.push(t);
  }
  return out;
}

export type ChargeDue =
  | { readonly due: true; readonly window: PeriodWindow }
  | { readonly due: false; readonly reason: 'not_started' | 'ended' }
  | { readonly due: false; readonly reason: 'already_charged'; readonly periodIndex: number };

/**
 * Is there a charge to attempt right now? Yes iff the permission is active and the CURRENT period
 * has no successful charge. Earlier unpaid periods are never due again (allowance does not roll over).
 * "Due" does not mean "retry time reached": that is the charge machine's job.
 */
export function chargeDue(
  s: PeriodSchedule,
  t: UnixSeconds,
  succeededPeriodIndices: ReadonlySet<number>,
): ChargeDue {
  const phase = phaseAt(s, t);
  if (phase !== 'active') return { due: false, reason: phase };
  const window = periodWindow(s, Math.floor((t - s.start) / s.periodSeconds));
  if (succeededPeriodIndices.has(window.index)) {
    return { due: false, reason: 'already_charged', periodIndex: window.index };
  }
  return { due: true, window };
}
