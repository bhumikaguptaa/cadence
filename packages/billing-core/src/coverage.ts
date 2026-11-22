/**
 * Coverage: does the subscriber's balance cover what is about to be charged?
 * This one pure function powers the rhythm strip and the "Add $X before <date>" warning.
 *
 * Model (kept deliberately simple and conservative):
 *  1. Sort the charges: by due time, then subscription id (code-unit order, never locale-dependent),
 *     then amount. That makes the result independent of input order, ties included.
 *  2. Walk them in order, spending the balance. The first charge that does not fit is "uncovered".
 *  3. Everything after the first uncovered charge is also reported uncovered, even if a smaller
 *     later charge would technically fit. (The strip turns amber from the first shortfall on, and
 *     fixing the first one is the one exact action we ask the user to take.)
 */

import { MoneyError } from './money';
import type { UnixSeconds } from './periods';

export type CoverageCharge = {
  readonly subscriptionId: string;
  readonly dueAt: UnixSeconds;
  /** micro-USDC */
  readonly amount: bigint;
};

export type CoverageEntry = {
  readonly charge: CoverageCharge;
  readonly status: 'covered' | 'uncovered';
  /** Balance left after this entry. Unchanged for uncovered entries (a failed charge spends nothing). */
  readonly balanceAfter: bigint;
};

export type CoverageResult = {
  /** All charges in processing order. */
  readonly entries: readonly CoverageEntry[];
  readonly allCovered: boolean;
  /** Due time of the last covered charge before the first shortfall; null if none were covered. */
  readonly coveredThroughAt: UnixSeconds | null;
  readonly firstUncovered: CoverageCharge | null;
  /** Minimal top-up that makes the first uncovered charge succeed. 0n when everything is covered. */
  readonly shortfall: bigint;
  /** Balance left after the covered charges. Always: coveredTotal + spare === balance. */
  readonly spare: bigint;
  readonly coveredTotal: bigint;
};

function compareCharges(a: CoverageCharge, b: CoverageCharge): number {
  if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
  if (a.subscriptionId !== b.subscriptionId) return a.subscriptionId < b.subscriptionId ? -1 : 1;
  if (a.amount !== b.amount) return a.amount < b.amount ? -1 : 1;
  return 0;
}

export function computeCoverage(
  balance: bigint,
  charges: readonly CoverageCharge[],
): CoverageResult {
  if (balance < 0n) throw new MoneyError('NEGATIVE_AMOUNT', 'Balance must not be negative.');
  for (const c of charges) {
    if (c.amount < 0n)
      throw new MoneyError('NEGATIVE_AMOUNT', 'Charge amount must not be negative.');
    if (!Number.isSafeInteger(c.dueAt)) {
      throw new MoneyError('INVALID_ARGUMENT', 'dueAt must be an integer number of unix seconds.');
    }
  }

  const sorted = [...charges].sort(compareCharges);
  const entries: CoverageEntry[] = [];
  let remaining = balance;
  let coveredTotal = 0n;
  let coveredThroughAt: UnixSeconds | null = null;
  let firstUncovered: CoverageCharge | null = null;
  let shortfall = 0n;

  for (const charge of sorted) {
    if (firstUncovered === null && charge.amount <= remaining) {
      remaining -= charge.amount;
      coveredTotal += charge.amount;
      coveredThroughAt = charge.dueAt;
      entries.push({ charge, status: 'covered', balanceAfter: remaining });
    } else {
      if (firstUncovered === null) {
        firstUncovered = charge;
        shortfall = charge.amount - remaining;
      }
      entries.push({ charge, status: 'uncovered', balanceAfter: remaining });
    }
  }

  return {
    entries,
    allCovered: firstUncovered === null,
    coveredThroughAt,
    firstUncovered,
    shortfall,
    spare: remaining,
    coveredTotal,
  };
}
