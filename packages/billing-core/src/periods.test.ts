import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_UINT48,
  PeriodsError,
  assertValidSchedule,
  chargeDue,
  createFakeClock,
  currentPeriod,
  daysToSeconds,
  nextPeriodStart,
  periodStartsBetween,
  periodWindow,
  phaseAt,
  systemClock,
  type PeriodSchedule,
} from './periods';

const DAY = 86_400;
const START = 1_700_000_000;
const monthly: PeriodSchedule = { start: START, periodSeconds: 30 * DAY, end: START + 365 * DAY };

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof PeriodsError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

describe('clock', () => {
  it('fake clock is controllable', () => {
    const c = createFakeClock(100);
    expect(c.nowSeconds()).toBe(100);
    c.advance(50);
    expect(c.nowSeconds()).toBe(150);
    c.set(7);
    expect(c.nowSeconds()).toBe(7);
  });
  it('fake clock rejects non-integer time', () => {
    expect(() => createFakeClock(1.5)).toThrow(PeriodsError);
  });
  it('system clock returns integer unix seconds near now', () => {
    const t = systemClock.nowSeconds();
    expect(Number.isInteger(t)).toBe(true);
    expect(Math.abs(t - Date.now() / 1000)).toBeLessThan(2);
  });
});

describe('daysToSeconds', () => {
  it('converts whole days', () => {
    expect(daysToSeconds(30)).toBe(2_592_000);
    expect(daysToSeconds(1)).toBe(DAY);
  });
  it('rejects zero, negatives and fractions', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(codeOf(() => daysToSeconds(bad))).toBe('INVALID_SCHEDULE');
    }
  });
});

describe('assertValidSchedule', () => {
  it('accepts a normal schedule', () => {
    expect(() => assertValidSchedule(monthly)).not.toThrow();
  });
  it.each([
    ['non-integer start', { ...monthly, start: 1.5 }],
    ['negative start', { ...monthly, start: -1 }],
    ['zero period', { ...monthly, periodSeconds: 0 }],
    ['end before start', { ...monthly, end: START - 1 }],
    ['end equal to start', { ...monthly, end: START }],
    ['end beyond uint48', { ...monthly, end: MAX_UINT48 + 1 }],
  ])('rejects %s', (_n, s) => {
    expect(codeOf(() => assertValidSchedule(s))).toBe('INVALID_SCHEDULE');
  });
});

describe('phaseAt (start inclusive, end exclusive, like the onchain permission)', () => {
  it('classifies times', () => {
    expect(phaseAt(monthly, START - 1)).toBe('not_started');
    expect(phaseAt(monthly, START)).toBe('active');
    expect(phaseAt(monthly, monthly.end - 1)).toBe('active');
    expect(phaseAt(monthly, monthly.end)).toBe('ended');
  });
});

describe('periodWindow / currentPeriod', () => {
  it('period 0 starts at the permission start', () => {
    expect(periodWindow(monthly, 0)).toEqual({
      index: 0,
      start: START,
      end: START + 30 * DAY,
      deadline: START + 30 * DAY,
    });
  });

  it('boundaries: last second of a period vs first of the next', () => {
    expect(currentPeriod(monthly, START + 30 * DAY - 1)?.index).toBe(0);
    expect(currentPeriod(monthly, START + 30 * DAY)?.index).toBe(1);
  });

  it('returns null outside the permission lifetime', () => {
    expect(currentPeriod(monthly, START - 1)).toBeNull();
    expect(currentPeriod(monthly, monthly.end)).toBeNull();
  });

  it('the final partial period has its deadline clamped to the permission end', () => {
    const s: PeriodSchedule = { start: 0, periodSeconds: 100, end: 250 };
    const last = currentPeriod(s, 220);
    expect(last).toEqual({ index: 2, start: 200, end: 300, deadline: 250 });
  });

  it('rejects negative or out-of-range period indices', () => {
    expect(codeOf(() => periodWindow(monthly, -1))).toBe('PERIOD_OUT_OF_RANGE');
    expect(codeOf(() => periodWindow(monthly, 1.5))).toBe('PERIOD_OUT_OF_RANGE');
    const s: PeriodSchedule = { start: 0, periodSeconds: 100, end: 250 };
    expect(() => periodWindow(s, 2)).not.toThrow();
    expect(codeOf(() => periodWindow(s, 3))).toBe('PERIOD_OUT_OF_RANGE');
  });

  it('works for a 5-minute test period', () => {
    const s: PeriodSchedule = { start: START, periodSeconds: 300, end: START + 3600 };
    expect(currentPeriod(s, START + 299)?.index).toBe(0);
    expect(currentPeriod(s, START + 300)?.index).toBe(1);
    expect(currentPeriod(s, START + 3599)?.index).toBe(11);
  });

  it('property: current period contains t, and windows tile time with no gaps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (start, period, length, frac) => {
          const s: PeriodSchedule = { start, periodSeconds: period, end: start + length };
          const t = start + Math.floor(frac * (length - 1));
          const w = currentPeriod(s, t);
          expect(w).not.toBeNull();
          if (!w) return;
          expect(w.start <= t && t < w.end).toBe(true);
          expect(w.index).toBe(Math.floor((t - start) / period));
          expect(w.end - w.start).toBe(period);
          expect(w.deadline).toBe(Math.min(w.end, s.end));
          if (w.start > start) {
            expect(periodWindow(s, w.index - 1).end).toBe(w.start);
          }
        },
      ),
    );
  });
});

describe('nextPeriodStart', () => {
  it('before the start, the next one is the permission start', () => {
    expect(nextPeriodStart(monthly, START - 10)).toBe(START);
  });
  it('mid period, it is the next boundary; exactly on a boundary it is the one after', () => {
    expect(nextPeriodStart(monthly, START + 5)).toBe(START + 30 * DAY);
    expect(nextPeriodStart(monthly, START + 30 * DAY)).toBe(START + 60 * DAY);
  });
  it('returns null when no further period starts before the permission ends', () => {
    const s: PeriodSchedule = { start: 0, periodSeconds: 100, end: 250 };
    expect(nextPeriodStart(s, 150)).toBe(200);
    expect(nextPeriodStart(s, 200)).toBeNull();
    expect(nextPeriodStart(s, 250)).toBeNull();
  });
});

describe('periodStartsBetween', () => {
  it('lists boundaries in [from, to)', () => {
    const s: PeriodSchedule = { start: 1000, periodSeconds: 100, end: 2000 };
    expect(periodStartsBetween(s, 1000, 1300)).toEqual([1000, 1100, 1200]);
    expect(periodStartsBetween(s, 1001, 1300)).toEqual([1100, 1200]);
    expect(periodStartsBetween(s, 1100, 1100)).toEqual([]);
    expect(periodStartsBetween(s, 0, 500)).toEqual([]);
  });
  it('never returns starts at or after the permission end', () => {
    const s: PeriodSchedule = { start: 0, periodSeconds: 100, end: 250 };
    expect(periodStartsBetween(s, 0, 10_000)).toEqual([0, 100, 200]);
  });
  it('rejects reversed ranges and absurdly many results', () => {
    expect(codeOf(() => periodStartsBetween(monthly, 10, 5))).toBe('INVALID_RANGE');
    const tiny: PeriodSchedule = { start: 0, periodSeconds: 1, end: 1_000_000 };
    expect(codeOf(() => periodStartsBetween(tiny, 0, 1_000_000))).toBe('TOO_MANY_PERIODS');
  });
});

describe('chargeDue: only the CURRENT period can be charged (allowance never rolls over)', () => {
  const none = new Set<number>();
  it('not due before the start or after the end', () => {
    expect(chargeDue(monthly, START - 1, none)).toEqual({ due: false, reason: 'not_started' });
    expect(chargeDue(monthly, monthly.end, none)).toEqual({ due: false, reason: 'ended' });
  });
  it('due as soon as a period begins and it has no successful charge', () => {
    const r = chargeDue(monthly, START, none);
    expect(r).toMatchObject({ due: true, window: { index: 0 } });
  });
  it('not due once this period has a succeeded charge, but due again next period', () => {
    const done = new Set([0]);
    expect(chargeDue(monthly, START + 10, done)).toEqual({
      due: false,
      reason: 'already_charged',
      periodIndex: 0,
    });
    expect(chargeDue(monthly, START + 30 * DAY, done)).toMatchObject({
      due: true,
      window: { index: 1 },
    });
  });
  it('a missed earlier period does not make that period due again', () => {
    // Periods 0 and 1 never charged (scheduler was down); we are in period 2.
    const r = chargeDue(monthly, START + 65 * DAY, none);
    expect(r).toMatchObject({ due: true, window: { index: 2 } });
  });
});
