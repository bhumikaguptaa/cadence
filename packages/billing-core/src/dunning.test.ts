import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUNNING_POLICY,
  DunningError,
  decideAfterFailure,
  retryOffsets,
  retrySchedule,
  subscriptionStatusAfterGiveUp,
  type DunningPolicy,
} from './dunning';

const DAY = 86_400;

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof DunningError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

describe('default policy', () => {
  it('is 20% / 50% of the period, capped at +2 days / +5 days', () => {
    expect(DEFAULT_DUNNING_POLICY.retries).toEqual([
      { fractionBps: 2000, capSeconds: 2 * DAY },
      { fractionBps: 5000, capSeconds: 5 * DAY },
    ]);
  });
});

describe('retryOffsets: offset_k = max(prev + 1, 1, min(cap_k, floor(period * bps / 10000)))', () => {
  it.each([
    ['30-day period: caps win (6d -> 2d, 15d -> 5d)', 30 * DAY, [2 * DAY, 5 * DAY]],
    ['365-day period: caps win', 365 * DAY, [2 * DAY, 5 * DAY]],
    ['7-day period: 1.4d < 2d and 3.5d < 5d, fractions win', 7 * DAY, [120_960, 302_400]],
    ['1-day period', DAY, [17_280, 43_200]],
    ['5-minute test period: 60s and 150s', 300, [60, 150]],
    [
      '10-day period: 20% = 2d (exactly the cap), 50% = 5d (exactly the cap)',
      10 * DAY,
      [2 * DAY, 5 * DAY],
    ],
    ['3-second period: floors to 0 then 1; forced strictly increasing', 3, [1, 2]],
    ['1-second period: still strictly increasing', 1, [1, 2]],
  ])('%s', (_n, period, expected) => {
    expect(retryOffsets(DEFAULT_DUNNING_POLICY, period)).toEqual(expected);
  });

  it('a policy with no retries gives no offsets', () => {
    expect(retryOffsets({ retries: [], cancelAfterGivenUpPeriods: 1 }, 300)).toEqual([]);
  });

  it('property: always positive integers, strictly increasing', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 * DAY }), (period) => {
        const o = retryOffsets(DEFAULT_DUNNING_POLICY, period);
        expect(o).toHaveLength(2);
        expect(o.every((x) => Number.isInteger(x) && x >= 1)).toBe(true);
        expect(o[0]! < o[1]!).toBe(true);
      }),
    );
  });

  it('property: never later than the cap or the fraction (for periods long enough not to need bumping)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 400 * DAY }), (period) => {
        const o = retryOffsets(DEFAULT_DUNNING_POLICY, period);
        DEFAULT_DUNNING_POLICY.retries.forEach((r, i) => {
          expect(o[i]!).toBeLessThanOrEqual(
            Math.min(r.capSeconds, Math.floor((period * r.fractionBps) / 10_000)),
          );
        });
      }),
    );
  });
});

describe('retrySchedule: only retries that land before the deadline', () => {
  const base = { periodSeconds: 300, deadline: 1_000_300, firstFailureAt: 1_000_005 };
  it('lists both retries when there is time', () => {
    expect(retrySchedule(DEFAULT_DUNNING_POLICY, base)).toEqual([1_000_065, 1_000_155]);
  });
  it('drops retries that would land at or after the deadline', () => {
    expect(retrySchedule(DEFAULT_DUNNING_POLICY, { ...base, firstFailureAt: 1_000_250 })).toEqual(
      [],
    );
    // first retry fits (150+60=210 <300), second does not (150+150=300, not < 300)
    expect(retrySchedule(DEFAULT_DUNNING_POLICY, { ...base, firstFailureAt: 1_000_150 })).toEqual([
      1_000_210,
    ]);
  });
  it('uses the permission-end deadline when it is earlier than the period end', () => {
    expect(retrySchedule(DEFAULT_DUNNING_POLICY, { ...base, deadline: 1_000_100 })).toEqual([
      1_000_065,
    ]);
  });
});

describe('decideAfterFailure', () => {
  const ctx = {
    policy: DEFAULT_DUNNING_POLICY,
    periodSeconds: 300,
    deadline: 1_000_300,
    firstFailureAt: 1_000_005,
  };

  it('walks the whole 5-minute scenario: retry, retry, give up', () => {
    expect(decideAfterFailure({ ...ctx, failuresSoFar: 1, now: 1_000_005 })).toEqual({
      kind: 'retry',
      at: 1_000_065,
      retryNumber: 1,
    });
    expect(decideAfterFailure({ ...ctx, failuresSoFar: 2, now: 1_000_070 })).toEqual({
      kind: 'retry',
      at: 1_000_155,
      retryNumber: 2,
    });
    expect(decideAfterFailure({ ...ctx, failuresSoFar: 3, now: 1_000_160 })).toEqual({
      kind: 'give_up',
      reason: 'RETRIES_EXHAUSTED',
    });
  });

  it('30-day period: retries at +2d and +5d after the first failure, then gives up', () => {
    const month = {
      policy: DEFAULT_DUNNING_POLICY,
      periodSeconds: 30 * DAY,
      deadline: 30 * DAY,
      firstFailureAt: 0,
    };
    expect(decideAfterFailure({ ...month, failuresSoFar: 1, now: 0 })).toMatchObject({
      kind: 'retry',
      at: 2 * DAY,
    });
    expect(decideAfterFailure({ ...month, failuresSoFar: 2, now: 2 * DAY })).toMatchObject({
      kind: 'retry',
      at: 5 * DAY,
    });
    expect(decideAfterFailure({ ...month, failuresSoFar: 3, now: 5 * DAY })).toMatchObject({
      kind: 'give_up',
    });
  });

  it('gives up immediately when the first failure is so late no retry fits', () => {
    expect(
      decideAfterFailure({ ...ctx, failuresSoFar: 1, firstFailureAt: 1_000_250, now: 1_000_250 }),
    ).toEqual({
      kind: 'give_up',
      reason: 'NO_TIME_BEFORE_DEADLINE',
    });
  });

  it('a late scheduler run retries "now", not in the past, as long as it is still before the deadline', () => {
    expect(decideAfterFailure({ ...ctx, failuresSoFar: 1, now: 1_000_100 })).toEqual({
      kind: 'retry',
      at: 1_000_100,
      retryNumber: 1,
    });
    expect(decideAfterFailure({ ...ctx, failuresSoFar: 1, now: 1_000_300 })).toMatchObject({
      kind: 'give_up',
      reason: 'NO_TIME_BEFORE_DEADLINE',
    });
  });

  it('rejects nonsense inputs', () => {
    expect(codeOf(() => decideAfterFailure({ ...ctx, failuresSoFar: 0, now: 0 }))).toBe(
      'INVALID_ARGUMENT',
    );
    expect(codeOf(() => decideAfterFailure({ ...ctx, failuresSoFar: 1.5, now: 0 }))).toBe(
      'INVALID_ARGUMENT',
    );
    expect(
      codeOf(() => decideAfterFailure({ ...ctx, firstFailureAt: -1, failuresSoFar: 1, now: 0 })),
    ).toBe('INVALID_ARGUMENT');
    expect(
      codeOf(() => decideAfterFailure({ ...ctx, deadline: 1_000_000, failuresSoFar: 1, now: 0 })),
    ).toBe('INVALID_ARGUMENT');
  });

  it('property: a retry is never in the past and never at or after the deadline', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 * DAY }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100 * DAY }),
        fc.integer({ min: 0, max: 100 * DAY }),
        fc.integer({ min: 1, max: 4 }),
        (periodSeconds, firstFailureAt, failOffset, nowOffset, failuresSoFar) => {
          const deadline = firstFailureAt + failOffset + 1;
          const now = firstFailureAt + nowOffset;
          const d = decideAfterFailure({
            policy: DEFAULT_DUNNING_POLICY,
            periodSeconds,
            deadline,
            firstFailureAt,
            failuresSoFar,
            now,
          });
          if (d.kind === 'retry') {
            expect(d.at).toBeGreaterThanOrEqual(now);
            expect(d.at).toBeLessThan(deadline);
            expect(d.retryNumber).toBe(failuresSoFar);
          }
          if (failuresSoFar > DEFAULT_DUNNING_POLICY.retries.length) expect(d.kind).toBe('give_up');
        },
      ),
    );
  });
});

describe('policy validation', () => {
  const bad: [string, DunningPolicy][] = [
    [
      'zero fraction',
      { retries: [{ fractionBps: 0, capSeconds: 10 }], cancelAfterGivenUpPeriods: 1 },
    ],
    [
      'fraction over 100%',
      { retries: [{ fractionBps: 10_001, capSeconds: 10 }], cancelAfterGivenUpPeriods: 1 },
    ],
    [
      'fractional fraction',
      { retries: [{ fractionBps: 1.5, capSeconds: 10 }], cancelAfterGivenUpPeriods: 1 },
    ],
    ['zero cap', { retries: [{ fractionBps: 100, capSeconds: 0 }], cancelAfterGivenUpPeriods: 1 }],
    ['zero cancel threshold', { retries: [], cancelAfterGivenUpPeriods: 0 }],
  ];
  it.each(bad)('rejects %s', (_n, policy) => {
    expect(codeOf(() => retryOffsets(policy, 300))).toBe('INVALID_POLICY');
  });
  it('rejects an invalid period length', () => {
    expect(codeOf(() => retryOffsets(DEFAULT_DUNNING_POLICY, 0))).toBe('INVALID_ARGUMENT');
  });
});

describe('subscriptionStatusAfterGiveUp', () => {
  it('past_due first, canceled once the threshold of consecutive given-up periods is reached', () => {
    expect(subscriptionStatusAfterGiveUp(1, DEFAULT_DUNNING_POLICY)).toBe('past_due');
    expect(subscriptionStatusAfterGiveUp(2, DEFAULT_DUNNING_POLICY)).toBe('canceled');
    expect(subscriptionStatusAfterGiveUp(5, DEFAULT_DUNNING_POLICY)).toBe('canceled');
  });
  it('threshold 1 cancels immediately', () => {
    expect(subscriptionStatusAfterGiveUp(1, { retries: [], cancelAfterGivenUpPeriods: 1 })).toBe(
      'canceled',
    );
  });
  it('rejects counts below 1', () => {
    expect(codeOf(() => subscriptionStatusAfterGiveUp(0, DEFAULT_DUNNING_POLICY))).toBe(
      'INVALID_ARGUMENT',
    );
  });
});
