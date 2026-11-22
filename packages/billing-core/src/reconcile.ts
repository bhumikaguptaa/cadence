/**
 * Reconcile one charge against what actually happened onchain. Inputs are deliberately abstract
 * (plain data, no viem types): Phase 6 will map real receipt logs into `ObservedTx`.
 *
 * Expected settlement for one charge (ADR-002, two hops in a single transaction):
 *   1. USDC Transfer  subscriber  -> owner wallet   amount == plan amount
 *   2. USDC Transfer  owner wallet -> merchant payout  amount == plan amount
 * and nothing else. If the transaction does anything different, it is NOT accepted: it goes to
 * needs_review with every reason we can name. Only a transaction that reverted is a plain failure.
 *
 * Separately, if the owner wallet still holds USDC afterwards we raise an alert (the wallet should
 * end every charge at zero).
 */

export type Address = string;

export type ExpectedSettlement = {
  readonly subscriber: Address;
  readonly ownerWallet: Address;
  readonly payout: Address;
  /** The USDC token contract. */
  readonly token: Address;
  /** Plan amount, micro-USDC. Must be > 0. */
  readonly amount: bigint;
};

export type ObservedTransfer = {
  readonly txHash: string;
  readonly logIndex: number;
  readonly token: Address;
  readonly from: Address;
  readonly to: Address;
  readonly amount: bigint;
};

export type ObservedTx = {
  readonly txHash: string;
  readonly status: 'success' | 'reverted';
  /** Every ERC-20 Transfer log emitted by the transaction (any token). */
  readonly transfers: readonly ObservedTransfer[];
};

export type ReconcileReason =
  | 'MISSING_SPEND_TRANSFER'
  | 'MISSING_FORWARD_TRANSFER'
  | 'AMOUNT_MISMATCH'
  | 'RECIPIENT_MISMATCH'
  | 'DUPLICATE_TRANSFER'
  | 'UNEXPECTED_TRANSFER';

/** Fixed reporting order, so results are deterministic. */
const REASON_ORDER: readonly ReconcileReason[] = [
  'MISSING_SPEND_TRANSFER',
  'MISSING_FORWARD_TRANSFER',
  'AMOUNT_MISMATCH',
  'RECIPIENT_MISMATCH',
  'DUPLICATE_TRANSFER',
  'UNEXPECTED_TRANSFER',
];

export type ReconcileAlert = 'OWNER_HOLDS_USDC';

export type ReconcileResult =
  | { readonly outcome: 'matched'; readonly alerts: readonly ReconcileAlert[] }
  | {
      readonly outcome: 'failed';
      readonly reason: 'TX_REVERTED';
      readonly alerts: readonly ReconcileAlert[];
    }
  | {
      readonly outcome: 'needs_review';
      readonly reasons: readonly ReconcileReason[];
      readonly alerts: readonly ReconcileAlert[];
    };

export class ReconcileError extends Error {
  readonly code = 'INVALID_ARGUMENT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ReconcileError';
  }
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function addr(a: string, name: string): string {
  if (!ADDRESS_RE.test(a)) throw new ReconcileError(`${name} is not a valid address.`);
  return a.toLowerCase();
}

export function reconcileCharge(
  expected: ExpectedSettlement,
  observed: ObservedTx,
  ownerUsdcBalanceAfter: bigint,
): ReconcileResult {
  const subscriber = addr(expected.subscriber, 'subscriber');
  const owner = addr(expected.ownerWallet, 'ownerWallet');
  const payout = addr(expected.payout, 'payout');
  const token = addr(expected.token, 'token');
  if (expected.amount <= 0n) throw new ReconcileError('Expected amount must be positive.');
  if (owner === payout) throw new ReconcileError('Owner wallet and payout must differ.');
  if (owner === subscriber) throw new ReconcileError('Owner wallet and subscriber must differ.');
  if (ownerUsdcBalanceAfter < 0n) throw new ReconcileError('Owner balance must not be negative.');
  if (!HASH_RE.test(observed.txHash)) throw new ReconcileError('txHash is not a valid hash.');
  const txHash = observed.txHash.toLowerCase();

  const transfers = observed.transfers.map((x) => {
    if (x.txHash.toLowerCase() !== txHash) {
      throw new ReconcileError('A transfer belongs to a different transaction.');
    }
    return {
      token: addr(x.token, 'transfer.token'),
      from: addr(x.from, 'transfer.from'),
      to: addr(x.to, 'transfer.to'),
      amount: x.amount,
    };
  });

  const alerts: ReconcileAlert[] = ownerUsdcBalanceAfter > 0n ? ['OWNER_HOLDS_USDC'] : [];

  if (observed.status === 'reverted') {
    return { outcome: 'failed', reason: 'TX_REVERTED', alerts };
  }

  const isUsdc = (x: (typeof transfers)[number]) => x.token === token;
  const spendAll = transfers.filter((x) => isUsdc(x) && x.from === subscriber && x.to === owner);
  const forwardAll = transfers.filter((x) => isUsdc(x) && x.from === owner && x.to === payout);
  // Owner sent USDC somewhere other than the merchant payout.
  const misdirected = transfers.filter((x) => isUsdc(x) && x.from === owner && x.to !== payout);
  const classified = new Set([...spendAll, ...forwardAll, ...misdirected]);
  const unexpected = transfers.filter((x) => !classified.has(x));

  const exact = (xs: typeof spendAll) => xs.some((x) => x.amount === expected.amount);
  const found = new Set<ReconcileReason>();
  if (spendAll.length === 0) found.add('MISSING_SPEND_TRANSFER');
  if (forwardAll.length === 0 && misdirected.length === 0) found.add('MISSING_FORWARD_TRANSFER');
  if ((spendAll.length > 0 && !exact(spendAll)) || (forwardAll.length > 0 && !exact(forwardAll))) {
    found.add('AMOUNT_MISMATCH');
  }
  if (misdirected.length > 0) found.add('RECIPIENT_MISMATCH');
  if (spendAll.length > 1 || forwardAll.length > 1) found.add('DUPLICATE_TRANSFER');
  if (unexpected.length > 0) found.add('UNEXPECTED_TRANSFER');

  if (found.size === 0) return { outcome: 'matched', alerts };
  return { outcome: 'needs_review', reasons: REASON_ORDER.filter((r) => found.has(r)), alerts };
}

export type TxHashClaim = { readonly chargeId: string; readonly txHash: string };

/** Different charges must never claim the same transaction. Returns each shared hash with its charges. */
export function findDuplicateTxHashes(
  claims: readonly TxHashClaim[],
): { txHash: string; chargeIds: string[] }[] {
  const byHash = new Map<string, string[]>();
  for (const c of claims) {
    const key = c.txHash.toLowerCase();
    byHash.set(key, [...(byHash.get(key) ?? []), c.chargeId]);
  }
  return [...byHash.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([txHash, ids]) => ({ txHash, chargeIds: [...ids].sort() }))
    .sort((a, b) => (a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0));
}
