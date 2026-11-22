import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeCoverage, type CoverageCharge } from './coverage';
import { MoneyError, parseUsdc } from './money';

const usd = parseUsdc;
const ch = (subscriptionId: string, dueAt: number, amount: string): CoverageCharge => ({
  subscriptionId,
  dueAt,
  amount: usd(amount),
});

describe('computeCoverage: examples', () => {
  it('no charges: everything covered, all balance is spare', () => {
    const r = computeCoverage(usd('5'), []);
    expect(r).toMatchObject({
      allCovered: true,
      coveredThroughAt: null,
      firstUncovered: null,
      shortfall: 0n,
      spare: usd('5'),
      coveredTotal: 0n,
    });
    expect(r.entries).toEqual([]);
  });

  it('the Home example: $63.20 covers four subscriptions with $20.23 to spare', () => {
    const charges = [
      ch('notes', 100, '9.99'),
      ch('news', 200, '14.99'),
      ch('music', 300, '10.99'),
      ch('cloud', 400, '7.00'),
    ];
    const r = computeCoverage(usd('63.20'), charges);
    expect(r.allCovered).toBe(true);
    expect(r.spare).toBe(usd('20.23'));
    expect(r.coveredTotal).toBe(usd('42.97'));
    expect(r.coveredThroughAt).toBe(400);
  });

  it('exact balance is covered with zero spare (boundary)', () => {
    const r = computeCoverage(usd('9.99'), [ch('a', 1, '9.99')]);
    expect(r).toMatchObject({ allCovered: true, spare: 0n, shortfall: 0n });
  });

  it('one micro-USDC short is uncovered with a 1 micro shortfall', () => {
    const r = computeCoverage(usd('9.99') - 1n, [ch('a', 1, '9.99')]);
    expect(r.allCovered).toBe(false);
    expect(r.shortfall).toBe(1n);
    expect(r.coveredThroughAt).toBeNull();
    expect(r.firstUncovered).toEqual(ch('a', 1, '9.99'));
  });

  it('reports the first shortfall and the exact top-up', () => {
    const r = computeCoverage(usd('10'), [ch('a', 1, '9.99'), ch('b', 2, '9.99')]);
    expect(r.allCovered).toBe(false);
    expect(r.coveredThroughAt).toBe(1);
    expect(r.firstUncovered?.subscriptionId).toBe('b');
    expect(r.shortfall).toBe(usd('9.98')); // $0.01 left, needs $9.99
    expect(r.spare).toBe(usd('0.01'));
  });

  it('everything after the first uncovered charge is uncovered, even a smaller one that would fit', () => {
    const r = computeCoverage(usd('10'), [
      ch('a', 1, '9.99'),
      ch('b', 2, '9.99'),
      ch('c', 3, '0.01'),
    ]);
    expect(r.entries.map((e) => e.status)).toEqual(['covered', 'uncovered', 'uncovered']);
    expect(r.entries[2]?.balanceAfter).toBe(usd('0.01')); // balance untouched after the first failure
  });

  it('processes charges in date order regardless of input order', () => {
    const r = computeCoverage(usd('10'), [ch('late', 50, '9.99'), ch('early', 10, '9.99')]);
    expect(r.entries.map((e) => e.charge.subscriptionId)).toEqual(['early', 'late']);
    expect(r.firstUncovered?.subscriptionId).toBe('late');
  });

  it('breaks same-time ties by subscription id (code-unit order, not locale), then amount', () => {
    const r = computeCoverage(usd('10'), [ch('b', 5, '6'), ch('a', 5, '6'), ch('B', 5, '1')]);
    expect(r.entries.map((e) => e.charge.subscriptionId)).toEqual(['B', 'a', 'b']);
    const same = computeCoverage(usd('10'), [ch('a', 5, '3'), ch('a', 5, '2')]);
    expect(same.entries.map((e) => e.charge.amount)).toEqual([usd('2'), usd('3')]);
  });

  it('a tie decides which subscription is the first uncovered one', () => {
    const r = computeCoverage(usd('6'), [ch('zeta', 5, '6'), ch('alpha', 5, '6')]);
    expect(r.firstUncovered?.subscriptionId).toBe('zeta');
  });

  it('zero-amount charges are covered and consume nothing', () => {
    const r = computeCoverage(0n, [ch('free', 1, '0')]);
    expect(r.allCovered).toBe(true);
  });

  it('rejects negative balances and amounts', () => {
    expect(() => computeCoverage(-1n, [])).toThrow(MoneyError);
    expect(() => computeCoverage(0n, [{ subscriptionId: 'a', dueAt: 1, amount: -1n }])).toThrow(
      MoneyError,
    );
  });

  it('rejects non-integer due times', () => {
    expect(() => computeCoverage(0n, [{ subscriptionId: 'a', dueAt: 1.5, amount: 1n }])).toThrow(
      /dueAt/,
    );
  });

  it('does not mutate its input', () => {
    const input = [ch('b', 2, '1'), ch('a', 1, '1')];
    const copy = [...input];
    computeCoverage(usd('5'), input);
    expect(input).toEqual(copy);
  });
});

const chargeArb = fc.record({
  subscriptionId: fc.constantFrom('a', 'b', 'c', 'd', 'B', 'sub-1', 'sub-2'),
  dueAt: fc.integer({ min: 0, max: 20 }), // small range forces many same-time ties
  amount: fc.bigInt({ min: 0n, max: 50_000_000n }),
});
const chargesArb = fc.array(chargeArb, { minLength: 0, maxLength: 12 });
const balanceArb = fc.bigInt({ min: 0n, max: 200_000_000n });

describe('computeCoverage: properties', () => {
  it('covered charges + spare always equals the balance', () => {
    fc.assert(
      fc.property(balanceArb, chargesArb, (balance, charges) => {
        const r = computeCoverage(balance, charges);
        const covered = r.entries
          .filter((e) => e.status === 'covered')
          .reduce((sum, e) => sum + e.charge.amount, 0n);
        expect(covered).toBe(r.coveredTotal);
        expect(covered + r.spare).toBe(balance);
      }),
    );
  });

  it('output does not depend on input order', () => {
    fc.assert(
      fc.property(
        balanceArb,
        chargesArb.chain((cs) =>
          fc
            .shuffledSubarray(cs, { minLength: cs.length, maxLength: cs.length })
            .map((shuffled) => [cs, shuffled] as const),
        ),
        (balance, [original, shuffled]) => {
          expect(computeCoverage(balance, shuffled)).toEqual(computeCoverage(balance, original));
        },
      ),
    );
  });

  it('the shortfall is the minimal top-up that covers the first uncovered charge', () => {
    fc.assert(
      fc.property(balanceArb, chargesArb, (balance, charges) => {
        const r = computeCoverage(balance, charges);
        if (r.allCovered) {
          expect(r.shortfall).toBe(0n);
          expect(r.firstUncovered).toBeNull();
          return;
        }
        const idx = r.entries.findIndex((e) => e.status === 'uncovered');
        expect(r.shortfall > 0n).toBe(true);
        // Top up exactly the shortfall: that charge is now covered...
        const topped = computeCoverage(balance + r.shortfall, charges);
        expect(topped.entries[idx]?.status).toBe('covered');
        // ...and one micro less is not enough.
        const almost = computeCoverage(balance + r.shortfall - 1n, charges);
        expect(almost.entries[idx]?.status).toBe('uncovered');
      }),
    );
  });

  it('more balance never makes coverage worse', () => {
    fc.assert(
      fc.property(
        balanceArb,
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        chargesArb,
        (b, extra, cs) => {
          const lo = computeCoverage(b, cs).entries.filter((e) => e.status === 'covered').length;
          const hi = computeCoverage(b + extra, cs).entries.filter(
            (e) => e.status === 'covered',
          ).length;
          expect(hi).toBeGreaterThanOrEqual(lo);
        },
      ),
    );
  });

  it('covered entries are always a prefix of the sorted list', () => {
    fc.assert(
      fc.property(balanceArb, chargesArb, (balance, charges) => {
        const statuses = computeCoverage(balance, charges).entries.map((e) => e.status);
        const firstBad = statuses.indexOf('uncovered');
        if (firstBad >= 0)
          expect(statuses.slice(firstBad).every((s) => s === 'uncovered')).toBe(true);
      }),
    );
  });
});
