import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ReconcileError,
  findDuplicateTxHashes,
  reconcileCharge,
  type ExpectedSettlement,
  type ObservedTransfer,
  type ObservedTx,
} from './reconcile';

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const SUBSCRIBER = addr(0xa1);
const OWNER = addr(0xb2);
const PAYOUT = addr(0xc3);
const OTHER = addr(0xd4);
const USDC = addr(0x5d);
const HASH = `0x${'ab'.repeat(32)}`;
const AMOUNT = 9_990_000n;

const expected: ExpectedSettlement = {
  subscriber: SUBSCRIBER,
  ownerWallet: OWNER,
  payout: PAYOUT,
  token: USDC,
  amount: AMOUNT,
};

const t = (
  from: string,
  to: string,
  amount: bigint,
  logIndex = 0,
  token = USDC,
): ObservedTransfer => ({
  txHash: HASH,
  logIndex,
  token,
  from,
  to,
  amount,
});
const spend = (amount = AMOUNT, i = 0) => t(SUBSCRIBER, OWNER, amount, i);
const forward = (amount = AMOUNT, i = 1) => t(OWNER, PAYOUT, amount, i);
const tx = (
  transfers: ObservedTransfer[],
  status: 'success' | 'reverted' = 'success',
): ObservedTx => ({
  txHash: HASH,
  status,
  transfers,
});

const reasonsOf = (r: ReturnType<typeof reconcileCharge>) =>
  r.outcome === 'needs_review' ? r.reasons : [];

describe('reconcileCharge: the happy path', () => {
  it('matches exactly one subscriber->owner and one owner->payout transfer of the plan amount', () => {
    expect(reconcileCharge(expected, tx([spend(), forward()]), 0n)).toEqual({
      outcome: 'matched',
      alerts: [],
    });
  });
  it('is insensitive to address case and transfer order', () => {
    const upper = { ...expected, subscriber: SUBSCRIBER.toUpperCase().replace('0X', '0x') };
    expect(reconcileCharge(upper, tx([forward(), spend()]), 0n).outcome).toBe('matched');
  });
});

describe('reconcileCharge: anything else goes to needs_review (never silently accepted)', () => {
  it('missing spend transfer', () => {
    expect(reasonsOf(reconcileCharge(expected, tx([forward()]), 0n))).toEqual([
      'MISSING_SPEND_TRANSFER',
    ]);
  });
  it('missing forward transfer', () => {
    expect(reasonsOf(reconcileCharge(expected, tx([spend()]), 0n))).toEqual([
      'MISSING_FORWARD_TRANSFER',
    ]);
  });
  it('no transfers at all in a successful tx', () => {
    expect(reasonsOf(reconcileCharge(expected, tx([]), 0n))).toEqual([
      'MISSING_SPEND_TRANSFER',
      'MISSING_FORWARD_TRANSFER',
    ]);
  });
  it('spend amount lower or higher than the plan amount', () => {
    expect(reasonsOf(reconcileCharge(expected, tx([spend(AMOUNT - 1n), forward()]), 0n))).toEqual([
      'AMOUNT_MISMATCH',
    ]);
    expect(reasonsOf(reconcileCharge(expected, tx([spend(AMOUNT + 1n), forward()]), 0n))).toEqual([
      'AMOUNT_MISMATCH',
    ]);
  });
  it('forward amount differs from the plan amount', () => {
    expect(reasonsOf(reconcileCharge(expected, tx([spend(), forward(AMOUNT - 1n)]), 0n))).toEqual([
      'AMOUNT_MISMATCH',
    ]);
  });
  it('owner forwarded the right amount to the WRONG address', () => {
    const r = reconcileCharge(expected, tx([spend(), t(OWNER, OTHER, AMOUNT, 1)]), 0n);
    expect(reasonsOf(r)).toEqual(['RECIPIENT_MISMATCH']);
  });
  it('duplicate spend or duplicate forward', () => {
    expect(
      reasonsOf(reconcileCharge(expected, tx([spend(), spend(AMOUNT, 2), forward()]), 0n)),
    ).toEqual(['DUPLICATE_TRANSFER']);
    expect(
      reasonsOf(reconcileCharge(expected, tx([spend(), forward(), forward(AMOUNT, 2)]), 0n)),
    ).toEqual(['DUPLICATE_TRANSFER']);
  });
  it('an extra unrelated USDC transfer in the same tx', () => {
    const r = reconcileCharge(expected, tx([spend(), forward(), t(OTHER, PAYOUT, 1n, 2)]), 0n);
    expect(reasonsOf(r)).toEqual(['UNEXPECTED_TRANSFER']);
  });
  it('a transfer of a different token does not count as the USDC transfer', () => {
    const r = reconcileCharge(
      expected,
      tx([t(SUBSCRIBER, OWNER, AMOUNT, 0, addr(0x99)), forward()]),
      0n,
    );
    expect(reasonsOf(r)).toEqual(['MISSING_SPEND_TRANSFER', 'UNEXPECTED_TRANSFER']);
  });
  it('reports several problems together, in a fixed order', () => {
    const r = reconcileCharge(
      expected,
      tx([spend(AMOUNT + 5n), t(OWNER, OTHER, AMOUNT, 1), t(OTHER, OTHER, 1n, 2)]),
      0n,
    );
    expect(reasonsOf(r)).toEqual(['AMOUNT_MISMATCH', 'RECIPIENT_MISMATCH', 'UNEXPECTED_TRANSFER']);
  });
});

describe('reconcileCharge: reverts and the owner-wallet alert', () => {
  it('a reverted transaction is a failed charge (retryable), not an anomaly', () => {
    expect(reconcileCharge(expected, tx([], 'reverted'), 0n)).toEqual({
      outcome: 'failed',
      reason: 'TX_REVERTED',
      alerts: [],
    });
  });
  it('alerts when the owner wallet still holds USDC after the charge, even if matched', () => {
    expect(reconcileCharge(expected, tx([spend(), forward()]), 1n)).toEqual({
      outcome: 'matched',
      alerts: ['OWNER_HOLDS_USDC'],
    });
  });
  it('the alert accompanies needs_review and failed outcomes too', () => {
    expect(reconcileCharge(expected, tx([spend()]), AMOUNT).alerts).toEqual(['OWNER_HOLDS_USDC']);
    expect(reconcileCharge(expected, tx([], 'reverted'), 5n).alerts).toEqual(['OWNER_HOLDS_USDC']);
  });
});

describe('reconcileCharge: caller mistakes throw', () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof ReconcileError ? e.code : 'OTHER';
    }
    return 'NO_ERROR';
  };
  it.each([
    ['bad address', { ...expected, payout: '0x123' }],
    ['zero amount', { ...expected, amount: 0n }],
    ['negative amount', { ...expected, amount: -1n }],
    ['owner equals payout (no forward would exist)', { ...expected, payout: OWNER }],
    ['subscriber equals owner', { ...expected, subscriber: OWNER }],
  ])('rejects expected settlement with %s', (_n, e) => {
    expect(code(() => reconcileCharge(e as ExpectedSettlement, tx([]), 0n))).toBe(
      'INVALID_ARGUMENT',
    );
  });
  it('rejects a negative owner balance and transfers from another tx', () => {
    expect(code(() => reconcileCharge(expected, tx([]), -1n))).toBe('INVALID_ARGUMENT');
    const stray = { ...spend(), txHash: `0x${'cd'.repeat(32)}` };
    expect(code(() => reconcileCharge(expected, tx([stray]), 0n))).toBe('INVALID_ARGUMENT');
  });
  it('rejects a malformed transaction hash', () => {
    expect(
      code(() =>
        reconcileCharge(expected, { txHash: 'nope', status: 'success', transfers: [] }, 0n),
      ),
    ).toBe('INVALID_ARGUMENT');
  });
});

describe('reconcileCharge: properties', () => {
  const noiseArb = fc.array(
    fc.record({
      from: fc.constantFrom(SUBSCRIBER, OWNER, PAYOUT, OTHER),
      to: fc.constantFrom(SUBSCRIBER, OWNER, PAYOUT, OTHER),
      amount: fc.bigInt({ min: 1n, max: 20_000_000n }),
      token: fc.constantFrom(USDC, addr(0x99)),
    }),
    { maxLength: 5 },
  );
  const txArb = fc
    .tuple(fc.boolean(), fc.boolean(), noiseArb)
    .map(([withSpend, withForward, noise]) => [
      ...(withSpend ? [spend()] : []),
      ...(withForward ? [forward()] : []),
      ...noise.map((n, i) => t(n.from, n.to, n.amount, 10 + i, n.token)),
    ]);

  it('"matched" is only ever returned for exactly the two expected transfers', () => {
    fc.assert(
      fc.property(txArb, fc.bigInt({ min: 0n, max: 3n }), (transfers, balance) => {
        const r = reconcileCharge(expected, tx(transfers), balance);
        if (r.outcome === 'matched') {
          expect(transfers).toHaveLength(2);
          expect(
            transfers.filter(
              (x) =>
                x.from === SUBSCRIBER && x.to === OWNER && x.amount === AMOUNT && x.token === USDC,
            ),
          ).toHaveLength(1);
          expect(
            transfers.filter(
              (x) => x.from === OWNER && x.to === PAYOUT && x.amount === AMOUNT && x.token === USDC,
            ),
          ).toHaveLength(1);
        }
        expect(r.alerts.includes('OWNER_HOLDS_USDC')).toBe(balance > 0n);
      }),
      { numRuns: 400 },
    );
  });

  it('the result does not depend on transfer order', () => {
    fc.assert(
      fc.property(
        txArb.chain((ts) =>
          fc
            .shuffledSubarray(ts, { minLength: ts.length, maxLength: ts.length })
            .map((s) => [ts, s] as const),
        ),
        ([original, shuffled]) => {
          expect(reconcileCharge(expected, tx(shuffled), 0n)).toEqual(
            reconcileCharge(expected, tx(original), 0n),
          );
        },
      ),
    );
  });

  it('adding any extra transfer to a perfect tx can never keep it "matched"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(SUBSCRIBER, OWNER, PAYOUT, OTHER),
        fc.constantFrom(SUBSCRIBER, OWNER, PAYOUT, OTHER),
        fc.bigInt({ min: 0n, max: 20_000_000n }),
        (from, to, amount) => {
          const r = reconcileCharge(expected, tx([spend(), forward(), t(from, to, amount, 5)]), 0n);
          expect(r.outcome).toBe('needs_review');
        },
      ),
    );
  });
});

describe('findDuplicateTxHashes', () => {
  it('finds charges claiming the same transaction (case-insensitive), deterministically', () => {
    const h = `0x${'ab'.repeat(32)}`;
    const dups = findDuplicateTxHashes([
      { chargeId: 'c3', txHash: h.toUpperCase().replace('0X', '0x') },
      { chargeId: 'c1', txHash: h },
      { chargeId: 'c2', txHash: `0x${'cd'.repeat(32)}` },
    ]);
    expect(dups).toEqual([{ txHash: h, chargeIds: ['c1', 'c3'] }]);
  });
  it('returns nothing when all hashes are distinct', () => {
    expect(findDuplicateTxHashes([{ chargeId: 'a', txHash: HASH }])).toEqual([]);
  });
});
