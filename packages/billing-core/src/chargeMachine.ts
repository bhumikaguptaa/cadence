/**
 * Charge state machine. Pure: (snapshot, event) -> new snapshot or a typed error. No clock, no I/O,
 * never throws for bad transitions, never mutates its input.
 *
 *   scheduled --submit--> submitted --confirm_success--> succeeded
 *                              |
 *                        report_failure
 *                              v
 *   scheduled <--schedule_retry-- failed --give_up--> given_up
 *
 *   any state except needs_review --flag_anomaly--> needs_review --resolve_review--> succeeded | failed | given_up
 *
 * Who decides what: the dunning policy decides retry vs give up; the reconciler decides anomalies;
 * this module only says whether a move is legal and what it changes.
 */

import type { UnixSeconds } from './periods';

export type ChargeStatus =
  'scheduled' | 'submitted' | 'succeeded' | 'failed' | 'given_up' | 'needs_review';

export type ChargeSnapshot = {
  readonly status: ChargeStatus;
  /** Number of times this charge was submitted. */
  readonly attemptCount: number;
  /** When a scheduled retry may be submitted. null = immediately. Only set while `scheduled`. */
  readonly nextRetryAt: UnixSeconds | null;
  readonly errorCode: string | null;
  readonly txHash: string | null;
  readonly anomalyReason: string | null;
  /** The status the charge was in when it was flagged, for the human reviewer. */
  readonly reviewFrom: ChargeStatus | null;
};

export type ChargeEvent =
  | { readonly type: 'submit' }
  | { readonly type: 'confirm_success'; readonly txHash: string }
  | { readonly type: 'report_failure'; readonly errorCode: string }
  | { readonly type: 'schedule_retry'; readonly at: UnixSeconds }
  | { readonly type: 'give_up' }
  | { readonly type: 'flag_anomaly'; readonly reason: string }
  | {
      readonly type: 'resolve_review';
      readonly outcome: 'succeeded';
      readonly txHash: string;
    }
  | { readonly type: 'resolve_review'; readonly outcome: 'failed'; readonly errorCode: string }
  | { readonly type: 'resolve_review'; readonly outcome: 'given_up' };

export type TransitionError = {
  readonly code: 'ILLEGAL_TRANSITION' | 'INVALID_EVENT';
  readonly from: ChargeStatus;
  readonly event: ChargeEvent;
  readonly message: string;
};

export type TransitionResult =
  | { readonly ok: true; readonly charge: ChargeSnapshot }
  | { readonly ok: false; readonly error: TransitionError };

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function newCharge(): ChargeSnapshot {
  return {
    status: 'scheduled',
    attemptCount: 0,
    nextRetryAt: null,
    errorCode: null,
    txHash: null,
    anomalyReason: null,
    reviewFrom: null,
  };
}

export function isTerminal(status: ChargeStatus): boolean {
  return status === 'succeeded' || status === 'given_up';
}

/** Ready for the scheduler to submit: scheduled, and any retry time has arrived. */
export function isDueForSubmission(c: ChargeSnapshot, now: UnixSeconds): boolean {
  return c.status === 'scheduled' && (c.nextRetryAt === null || c.nextRetryAt <= now);
}

function nonEmpty(s: string): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

function invalidReason(event: ChargeEvent): string | null {
  switch (event.type) {
    case 'confirm_success':
      return TX_HASH_RE.test(event.txHash) ? null : 'txHash must be a 0x-prefixed 32-byte hash';
    case 'report_failure':
      return nonEmpty(event.errorCode) ? null : 'errorCode must not be empty';
    case 'schedule_retry':
      return Number.isSafeInteger(event.at) && event.at >= 0
        ? null
        : 'retry time must be a non-negative integer of unix seconds';
    case 'flag_anomaly':
      return nonEmpty(event.reason) ? null : 'anomaly reason must not be empty';
    case 'resolve_review':
      if (event.outcome === 'succeeded') {
        return TX_HASH_RE.test(event.txHash) ? null : 'txHash must be a 0x-prefixed 32-byte hash';
      }
      if (event.outcome === 'failed') {
        return nonEmpty(event.errorCode) ? null : 'errorCode must not be empty';
      }
      return null;
    default:
      return null;
  }
}

export function transition(charge: ChargeSnapshot, event: ChargeEvent): TransitionResult {
  const from = charge.status;
  const fail = (code: TransitionError['code'], message: string): TransitionResult => ({
    ok: false,
    error: { code, from, event, message },
  });
  const illegal = () =>
    fail('ILLEGAL_TRANSITION', `Cannot apply "${event.type}" to a ${from} charge.`);
  const ok = (patch: Partial<ChargeSnapshot>): TransitionResult => ({
    ok: true,
    charge: { ...charge, ...patch },
  });

  const bad = invalidReason(event);
  if (bad !== null) return fail('INVALID_EVENT', bad);

  switch (event.type) {
    case 'submit':
      if (from !== 'scheduled') return illegal();
      return ok({
        status: 'submitted',
        attemptCount: charge.attemptCount + 1,
        nextRetryAt: null,
        errorCode: null,
      });

    case 'confirm_success':
      if (from !== 'submitted') return illegal();
      return ok({ status: 'succeeded', txHash: event.txHash, errorCode: null });

    case 'report_failure':
      if (from !== 'submitted') return illegal();
      return ok({ status: 'failed', errorCode: event.errorCode });

    case 'schedule_retry':
      if (from !== 'failed') return illegal();
      return ok({ status: 'scheduled', nextRetryAt: event.at });

    case 'give_up':
      if (from !== 'failed') return illegal();
      return ok({ status: 'given_up', nextRetryAt: null });

    case 'flag_anomaly':
      if (from === 'needs_review') return illegal();
      // A charge under review must never be picked up by the scheduler: clear any retry time.
      return ok({
        status: 'needs_review',
        anomalyReason: event.reason,
        reviewFrom: from,
        nextRetryAt: null,
      });

    case 'resolve_review': {
      if (from !== 'needs_review') return illegal();
      const cleared = { anomalyReason: null, reviewFrom: null, nextRetryAt: null } as const;
      if (event.outcome === 'succeeded') {
        return ok({ ...cleared, status: 'succeeded', txHash: event.txHash, errorCode: null });
      }
      if (event.outcome === 'failed') {
        return ok({ ...cleared, status: 'failed', errorCode: event.errorCode });
      }
      return ok({ ...cleared, status: 'given_up' });
    }
  }
}
