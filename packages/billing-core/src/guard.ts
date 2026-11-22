/**
 * Pre-charge guard: the invariants that must hold before we ever ask the wallet to spend.
 *  - never charge a canceled or expired subscription
 *  - never charge more than the plan amount (or zero / negative)
 *  - at most one successful charge per period
 *  - the onchain permission must still be active and have enough remaining allowance
 * Returns the FIRST violated rule (in priority order) plus what the scheduler should do about it.
 */

import { chargeDue, type PeriodSchedule, type UnixSeconds } from './periods';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

export type PreChargeInput = {
  readonly subscriptionStatus: SubscriptionStatus;
  readonly schedule: PeriodSchedule;
  readonly now: UnixSeconds;
  readonly succeededPeriodIndices: ReadonlySet<number>;
  /** micro-USDC we are about to charge. */
  readonly amount: bigint;
  readonly planAmount: bigint;
  /** From getPermissionStatus, read just before charging. */
  readonly permission: { readonly isActive: boolean; readonly remainingSpend: bigint };
};

export type PreChargeReason =
  | 'AMOUNT_NOT_POSITIVE'
  | 'AMOUNT_EXCEEDS_PLAN'
  | 'SUBSCRIPTION_CLOSED'
  | 'PERMISSION_REVOKED'
  | 'NOT_STARTED'
  | 'PERMISSION_ENDED'
  | 'ALREADY_CHARGED'
  | 'ALLOWANCE_INSUFFICIENT';

export type PreChargeAction = 'skip' | 'mark_revoked' | 'needs_review';

export type PreChargeResult =
  | { readonly ok: true; readonly periodIndex: number }
  | { readonly ok: false; readonly reason: PreChargeReason; readonly action: PreChargeAction };

const stop = (reason: PreChargeReason, action: PreChargeAction): PreChargeResult => ({
  ok: false,
  reason,
  action,
});

export function evaluatePreCharge(i: PreChargeInput): PreChargeResult {
  // Our own bugs first: these should never happen, so a human looks.
  if (i.amount <= 0n) return stop('AMOUNT_NOT_POSITIVE', 'needs_review');
  if (i.amount > i.planAmount) return stop('AMOUNT_EXCEEDS_PLAN', 'needs_review');

  if (i.subscriptionStatus === 'canceled' || i.subscriptionStatus === 'expired') {
    return stop('SUBSCRIPTION_CLOSED', 'skip');
  }
  // The user revoked outside Cadence: quietly mark the subscription canceled.
  if (!i.permission.isActive) return stop('PERMISSION_REVOKED', 'mark_revoked');

  const due = chargeDue(i.schedule, i.now, i.succeededPeriodIndices);
  if (!due.due) {
    if (due.reason === 'not_started') return stop('NOT_STARTED', 'skip');
    if (due.reason === 'ended') return stop('PERMISSION_ENDED', 'skip');
    return stop('ALREADY_CHARGED', 'skip');
  }

  // Active permission but not enough allowance in this period: we mis-tracked something.
  if (i.permission.remainingSpend < i.amount) return stop('ALLOWANCE_INSUFFICIENT', 'needs_review');

  return { ok: true, periodIndex: due.window.index };
}
