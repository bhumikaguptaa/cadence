import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluatePreCharge, type PreChargeInput } from './guard';
import type { PeriodSchedule } from './periods';

const START = 1_000_000;
const schedule: PeriodSchedule = { start: START, periodSeconds: 3_000, end: START + 30_000 };
const PLAN = 9_990_000n;

const base: PreChargeInput = {
  subscriptionStatus: 'active',
  schedule,
  now: START + 10,
  succeededPeriodIndices: new Set<number>(),
  amount: PLAN,
  planAmount: PLAN,
  permission: { isActive: true, remainingSpend: PLAN },
};

describe('evaluatePreCharge', () => {
  it('allows a normal charge, reporting which period it is for', () => {
    expect(evaluatePreCharge(base)).toEqual({ ok: true, periodIndex: 0 });
  });

  it('allows a charge for a past_due subscription (we keep trying; dunning decides when to stop)', () => {
    expect(evaluatePreCharge({ ...base, subscriptionStatus: 'past_due' }).ok).toBe(true);
  });

  it.each(['canceled', 'expired'] as const)('never charges a %s subscription', (status) => {
    expect(evaluatePreCharge({ ...base, subscriptionStatus: status })).toEqual({
      ok: false,
      reason: 'SUBSCRIPTION_CLOSED',
      action: 'skip',
    });
  });

  it('never charges more than the plan amount', () => {
    expect(evaluatePreCharge({ ...base, amount: PLAN + 1n })).toEqual({
      ok: false,
      reason: 'AMOUNT_EXCEEDS_PLAN',
      action: 'needs_review',
    });
  });

  it('charging less than the plan amount is allowed, zero or negative is not', () => {
    expect(evaluatePreCharge({ ...base, amount: PLAN - 1n }).ok).toBe(true);
    expect(evaluatePreCharge({ ...base, amount: 0n })).toMatchObject({
      ok: false,
      reason: 'AMOUNT_NOT_POSITIVE',
    });
    expect(evaluatePreCharge({ ...base, amount: -5n })).toMatchObject({
      ok: false,
      reason: 'AMOUNT_NOT_POSITIVE',
    });
  });

  it('a revoked permission onchain marks the subscription revoked (no error noise)', () => {
    expect(
      evaluatePreCharge({ ...base, permission: { isActive: false, remainingSpend: 0n } }),
    ).toEqual({
      ok: false,
      reason: 'PERMISSION_REVOKED',
      action: 'mark_revoked',
    });
  });

  it('skips when the current period was already charged successfully (one success per period)', () => {
    expect(evaluatePreCharge({ ...base, succeededPeriodIndices: new Set([0]) })).toEqual({
      ok: false,
      reason: 'ALREADY_CHARGED',
      action: 'skip',
    });
  });

  it('skips outside the permission lifetime', () => {
    expect(evaluatePreCharge({ ...base, now: START - 1 })).toMatchObject({
      reason: 'NOT_STARTED',
      action: 'skip',
    });
    expect(evaluatePreCharge({ ...base, now: schedule.end })).toMatchObject({
      reason: 'PERMISSION_ENDED',
      action: 'skip',
    });
  });

  it('insufficient remaining allowance means our period tracking is wrong: needs_review, never a blind retry', () => {
    expect(
      evaluatePreCharge({ ...base, permission: { isActive: true, remainingSpend: PLAN - 1n } }),
    ).toEqual({ ok: false, reason: 'ALLOWANCE_INSUFFICIENT', action: 'needs_review' });
  });

  it('property: ok only when every invariant holds', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('active', 'past_due', 'canceled', 'expired'),
        fc.integer({ min: START - 100, max: START + 40_000 }),
        fc.boolean(),
        fc.bigInt({ min: -1n, max: 20_000_000n }),
        fc.boolean(),
        fc.bigInt({ min: 0n, max: 20_000_000n }),
        (status, now, alreadyCharged, amount, isActive, remaining) => {
          const r = evaluatePreCharge({
            ...base,
            subscriptionStatus: status,
            now,
            succeededPeriodIndices: alreadyCharged
              ? new Set([Math.max(0, Math.floor((now - START) / 3_000))])
              : new Set<number>(),
            amount,
            permission: { isActive, remainingSpend: remaining },
          });
          if (r.ok) {
            expect(status === 'active' || status === 'past_due').toBe(true);
            expect(amount > 0n && amount <= PLAN).toBe(true);
            expect(now >= START && now < schedule.end).toBe(true);
            expect(alreadyCharged).toBe(false);
            expect(isActive).toBe(true);
            expect(remaining >= amount).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
