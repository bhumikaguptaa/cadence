/**
 * Dunning: what to do after a charge fails. Pure functions over an explicit policy.
 *
 * THE SCALING RULE (exact). For retry k (k = 1, 2, ...), measured from the FIRST failure in the period:
 *
 *   offset_k = max( offset_(k-1) + 1,  1,  min( cap_k,  floor( periodSeconds * fractionBps_k / 10000 ) ) )
 *
 * Default policy: retry 1 at min(+2 days, 20% of the period), retry 2 at min(+5 days, 50%).
 *   30-day period  -> +2d, +5d          (the caps win)
 *    7-day period  -> +1.4d, +3.5d      (the fractions win)
 *    5-minute test -> +60s, +150s
 * The `max(prev + 1, 1, ...)` part only matters for tiny periods: it keeps offsets positive and
 * strictly increasing after flooring.
 *
 * A retry is only scheduled if it lands strictly BEFORE the deadline (min of the period end and the
 * permission end). Allowance does not roll over, so a retry after the deadline could never succeed
 * for this period. After the last retry fails, or if no retry fits, we give up.
 */

import type { UnixSeconds } from './periods';

export type RetryRule = {
  /** Fraction of the period, in basis points (1 bp = 0.01%). 2000 = 20%. */
  readonly fractionBps: number;
  /** Upper bound on this retry's offset, in seconds. */
  readonly capSeconds: number;
};

export type DunningPolicy = {
  /** One rule per retry, in order. Length = maximum number of retries. */
  readonly retries: readonly RetryRule[];
  /** Consecutive given-up periods after which the subscription is canceled (before that: past_due). */
  readonly cancelAfterGivenUpPeriods: number;
};

export const DEFAULT_DUNNING_POLICY: DunningPolicy = {
  retries: [
    { fractionBps: 2000, capSeconds: 2 * 86_400 },
    { fractionBps: 5000, capSeconds: 5 * 86_400 },
  ],
  cancelAfterGivenUpPeriods: 2,
};

export type DunningErrorCode = 'INVALID_POLICY' | 'INVALID_ARGUMENT';

export class DunningError extends Error {
  readonly code: DunningErrorCode;
  constructor(code: DunningErrorCode, message: string) {
    super(message);
    this.name = 'DunningError';
    this.code = code;
  }
}

function assertPolicy(p: DunningPolicy): void {
  const rulesOk = p.retries.every(
    (r) =>
      Number.isInteger(r.fractionBps) &&
      r.fractionBps >= 1 &&
      r.fractionBps <= 10_000 &&
      Number.isInteger(r.capSeconds) &&
      r.capSeconds >= 1,
  );
  if (
    !rulesOk ||
    !Number.isInteger(p.cancelAfterGivenUpPeriods) ||
    p.cancelAfterGivenUpPeriods < 1
  ) {
    throw new DunningError(
      'INVALID_POLICY',
      'Retry rules need fractionBps in 1..10000 and capSeconds >= 1; cancelAfterGivenUpPeriods >= 1.',
    );
  }
}

/** Retry offsets in seconds after the first failure. Strictly increasing positive integers. */
export function retryOffsets(policy: DunningPolicy, periodSeconds: number): number[] {
  assertPolicy(policy);
  if (!Number.isSafeInteger(periodSeconds) || periodSeconds < 1) {
    throw new DunningError('INVALID_ARGUMENT', 'periodSeconds must be a positive integer.');
  }
  const out: number[] = [];
  let prev = 0;
  for (const r of policy.retries) {
    const scaled = Math.floor((periodSeconds * r.fractionBps) / 10_000);
    const offset = Math.max(prev + 1, Math.min(r.capSeconds, scaled));
    out.push(offset);
    prev = offset;
  }
  return out;
}

export type ScheduleInput = {
  readonly periodSeconds: number;
  /** min(period end, permission end): nothing can be charged at or after this. */
  readonly deadline: UnixSeconds;
  readonly firstFailureAt: UnixSeconds;
};

/** The exact retry times to show in the RetryStepper: only those that fit before the deadline. */
export function retrySchedule(policy: DunningPolicy, input: ScheduleInput): UnixSeconds[] {
  assertTime(input.firstFailureAt, 'firstFailureAt');
  return retryOffsets(policy, input.periodSeconds)
    .map((o) => input.firstFailureAt + o)
    .filter((t) => t < input.deadline);
}

export type DunningDecision =
  | { readonly kind: 'retry'; readonly at: UnixSeconds; readonly retryNumber: number }
  | {
      readonly kind: 'give_up';
      readonly reason: 'RETRIES_EXHAUSTED' | 'NO_TIME_BEFORE_DEADLINE';
    };

export type DecideInput = ScheduleInput & {
  readonly policy: DunningPolicy;
  /** How many attempts have failed so far in this period (1 right after the first failure). */
  readonly failuresSoFar: number;
  readonly now: UnixSeconds;
};

export function decideAfterFailure(input: DecideInput): DunningDecision {
  const { policy, periodSeconds, deadline, firstFailureAt, failuresSoFar, now } = input;
  if (!Number.isInteger(failuresSoFar) || failuresSoFar < 1) {
    throw new DunningError('INVALID_ARGUMENT', 'failuresSoFar must be an integer >= 1.');
  }
  assertTime(firstFailureAt, 'firstFailureAt');
  assertTime(now, 'now');
  assertTime(deadline, 'deadline');
  if (deadline <= firstFailureAt) {
    throw new DunningError('INVALID_ARGUMENT', 'deadline must be after the first failure.');
  }

  const offsets = retryOffsets(policy, periodSeconds);
  const offset = offsets[failuresSoFar - 1];
  if (offset === undefined) return { kind: 'give_up', reason: 'RETRIES_EXHAUSTED' };

  // If the scheduler ran late, retry now rather than in the past, but never at/after the deadline.
  const at = Math.max(firstFailureAt + offset, now);
  if (at >= deadline) return { kind: 'give_up', reason: 'NO_TIME_BEFORE_DEADLINE' };
  return { kind: 'retry', at, retryNumber: failuresSoFar };
}

/** After a period is given up: past_due until the threshold of consecutive given-up periods, then canceled. */
export function subscriptionStatusAfterGiveUp(
  consecutiveGivenUpPeriods: number,
  policy: DunningPolicy,
): 'past_due' | 'canceled' {
  assertPolicy(policy);
  if (!Number.isInteger(consecutiveGivenUpPeriods) || consecutiveGivenUpPeriods < 1) {
    throw new DunningError(
      'INVALID_ARGUMENT',
      'consecutiveGivenUpPeriods must be an integer >= 1.',
    );
  }
  return consecutiveGivenUpPeriods >= policy.cancelAfterGivenUpPeriods ? 'canceled' : 'past_due';
}

function assertTime(t: number, name: string): void {
  if (!Number.isSafeInteger(t) || t < 0) {
    throw new DunningError(
      'INVALID_ARGUMENT',
      `${name} must be a non-negative integer of unix seconds.`,
    );
  }
}
