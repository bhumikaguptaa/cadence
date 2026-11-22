import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  isDueForSubmission,
  isTerminal,
  newCharge,
  transition,
  type ChargeEvent,
  type ChargeSnapshot,
  type ChargeStatus,
} from './chargeMachine';

const HASH = `0x${'ab'.repeat(32)}`;

const sampleEvents: Record<ChargeEvent['type'], ChargeEvent> = {
  submit: { type: 'submit' },
  confirm_success: { type: 'confirm_success', txHash: HASH },
  report_failure: { type: 'report_failure', errorCode: 'INSUFFICIENT_BALANCE' },
  schedule_retry: { type: 'schedule_retry', at: 5_000 },
  give_up: { type: 'give_up' },
  flag_anomaly: { type: 'flag_anomaly', reason: 'AMOUNT_MISMATCH' },
  resolve_review: { type: 'resolve_review', outcome: 'failed', errorCode: 'RESOLVED_BY_HUMAN' },
};
const eventTypes = Object.keys(sampleEvents) as ChargeEvent['type'][];

/** Written by hand, independent of the implementation: status -> event -> resulting status. */
const expected: Record<ChargeStatus, Partial<Record<ChargeEvent['type'], ChargeStatus>>> = {
  scheduled: { submit: 'submitted', flag_anomaly: 'needs_review' },
  submitted: {
    confirm_success: 'succeeded',
    report_failure: 'failed',
    flag_anomaly: 'needs_review',
  },
  failed: { schedule_retry: 'scheduled', give_up: 'given_up', flag_anomaly: 'needs_review' },
  succeeded: { flag_anomaly: 'needs_review' },
  given_up: { flag_anomaly: 'needs_review' },
  needs_review: { resolve_review: 'failed' }, // sample resolve_review resolves as "failed"
};

/** Build a snapshot in each status through legal moves only (so invariants hold). */
function inStatus(status: ChargeStatus): ChargeSnapshot {
  let c = newCharge();
  const apply = (e: ChargeEvent) => {
    const r = transition(c, e);
    if (!r.ok) throw new Error(`setup failed: ${r.error.message}`);
    c = r.charge;
  };
  switch (status) {
    case 'scheduled':
      break;
    case 'submitted':
      apply(sampleEvents.submit);
      break;
    case 'succeeded':
      apply(sampleEvents.submit);
      apply(sampleEvents.confirm_success);
      break;
    case 'failed':
      apply(sampleEvents.submit);
      apply(sampleEvents.report_failure);
      break;
    case 'given_up':
      apply(sampleEvents.submit);
      apply(sampleEvents.report_failure);
      apply(sampleEvents.give_up);
      break;
    case 'needs_review':
      apply(sampleEvents.submit);
      apply(sampleEvents.flag_anomaly);
      break;
  }
  expect(c.status).toBe(status);
  return c;
}

describe('every status x event combination (6 x 7 = 42)', () => {
  for (const status of Object.keys(expected) as ChargeStatus[]) {
    for (const type of eventTypes) {
      const target = expected[status][type];
      it(`${status} + ${type} -> ${target ?? 'ILLEGAL'}`, () => {
        const before = Object.freeze(inStatus(status));
        const result = transition(before, sampleEvents[type]);
        if (target === undefined) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('ILLEGAL_TRANSITION');
            expect(result.error.from).toBe(status);
          }
        } else {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.charge.status).toBe(target);
        }
      });
    }
  }
});

describe('transition effects', () => {
  it('submit counts the attempt and clears the retry time', () => {
    let c = newCharge();
    expect(c).toMatchObject({ status: 'scheduled', attemptCount: 0, nextRetryAt: null });
    c = ok(transition(c, { type: 'submit' }));
    expect(c.attemptCount).toBe(1);
    c = ok(transition(c, { type: 'report_failure', errorCode: 'E1' }));
    expect(c).toMatchObject({ status: 'failed', errorCode: 'E1', attemptCount: 1 });
    c = ok(transition(c, { type: 'schedule_retry', at: 777 }));
    expect(c).toMatchObject({ status: 'scheduled', nextRetryAt: 777, attemptCount: 1 });
    c = ok(transition(c, { type: 'submit' }));
    expect(c).toMatchObject({
      status: 'submitted',
      attemptCount: 2,
      nextRetryAt: null,
      errorCode: null,
    });
    c = ok(transition(c, { type: 'confirm_success', txHash: HASH }));
    expect(c).toMatchObject({ status: 'succeeded', txHash: HASH, errorCode: null });
  });

  it('give_up clears the retry time and keeps the last error', () => {
    let c = inStatus('failed');
    c = ok(transition(c, { type: 'give_up' }));
    expect(c).toMatchObject({
      status: 'given_up',
      nextRetryAt: null,
      errorCode: 'INSUFFICIENT_BALANCE',
    });
  });

  it('an anomaly records why and where it came from', () => {
    const c = ok(transition(inStatus('submitted'), { type: 'flag_anomaly', reason: 'DUPLICATE' }));
    expect(c).toMatchObject({
      status: 'needs_review',
      anomalyReason: 'DUPLICATE',
      reviewFrom: 'submitted',
    });
  });

  it('flagging an already-succeeded charge is allowed (late duplicate detection)', () => {
    const c = ok(transition(inStatus('succeeded'), { type: 'flag_anomaly', reason: 'DUPLICATE' }));
    expect(c.reviewFrom).toBe('succeeded');
    expect(c.txHash).toBe(HASH); // evidence is kept
  });

  it.each([
    ['succeeded', { type: 'resolve_review', outcome: 'succeeded', txHash: HASH }],
    ['failed', { type: 'resolve_review', outcome: 'failed', errorCode: 'X' }],
    ['given_up', { type: 'resolve_review', outcome: 'given_up' }],
  ] as const)('a human can resolve needs_review as %s', (status, event) => {
    const c = ok(transition(inStatus('needs_review'), event));
    expect(c.status).toBe(status);
    expect(c.anomalyReason).toBeNull();
    expect(c.reviewFrom).toBeNull();
  });

  it('does not mutate its input', () => {
    const before = Object.freeze(newCharge());
    transition(before, { type: 'submit' });
    expect(before.status).toBe('scheduled');
  });
});

describe('event validation', () => {
  it.each([
    ['bad tx hash', { type: 'confirm_success', txHash: '0x123' }, 'submitted'],
    ['empty error code', { type: 'report_failure', errorCode: '' }, 'submitted'],
    ['negative retry time', { type: 'schedule_retry', at: -1 }, 'failed'],
    ['fractional retry time', { type: 'schedule_retry', at: 1.5 }, 'failed'],
    ['empty anomaly reason', { type: 'flag_anomaly', reason: '' }, 'scheduled'],
    [
      'bad tx hash on resolve',
      { type: 'resolve_review', outcome: 'succeeded', txHash: 'nope' },
      'needs_review',
    ],
    [
      'empty error on resolve',
      { type: 'resolve_review', outcome: 'failed', errorCode: ' ' },
      'needs_review',
    ],
  ] as const)('rejects %s with INVALID_EVENT', (_n, event, status) => {
    const r = transition(inStatus(status), event);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVENT');
  });
});

describe('helpers', () => {
  it('isTerminal: only succeeded and given_up', () => {
    const terminal = (
      ['scheduled', 'submitted', 'succeeded', 'failed', 'given_up', 'needs_review'] as const
    ).filter(isTerminal);
    expect(terminal).toEqual(['succeeded', 'given_up']);
  });

  it('isDueForSubmission respects the retry time', () => {
    const fresh = newCharge();
    expect(isDueForSubmission(fresh, 0)).toBe(true);
    const retrying = ok(
      transition(
        ok(
          transition(ok(transition(fresh, { type: 'submit' })), {
            type: 'report_failure',
            errorCode: 'E',
          }),
        ),
        { type: 'schedule_retry', at: 100 },
      ),
    );
    expect(isDueForSubmission(retrying, 99)).toBe(false);
    expect(isDueForSubmission(retrying, 100)).toBe(true);
    expect(isDueForSubmission(inStatus('submitted'), 10_000)).toBe(false);
    expect(isDueForSubmission(inStatus('needs_review'), 10_000)).toBe(false);
  });
});

describe('properties over random event sequences', () => {
  const eventArb = fc.constantFrom(...eventTypes).map((t) => sampleEvents[t]);
  it('invariants hold whatever order events arrive in', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 40 }), (events) => {
        let c: ChargeSnapshot = newCharge();
        let prevAttempts = 0;
        for (const e of events) {
          const r = transition(c, e);
          if (r.ok) {
            c = r.charge;
          } else {
            // an illegal event must leave nothing changed (we keep using `c`)
            expect(r.error.from).toBe(c.status);
          }
          expect(c.attemptCount).toBeGreaterThanOrEqual(prevAttempts);
          prevAttempts = c.attemptCount;
          if (c.status === 'succeeded') expect(c.txHash).not.toBeNull();
          if (c.status === 'needs_review') {
            expect(c.anomalyReason).not.toBeNull();
            expect(c.reviewFrom).not.toBeNull();
          }
          if (c.nextRetryAt !== null) expect(c.status).toBe('scheduled');
        }
      }),
      { numRuns: 300 },
    );
  });
});

function ok(r: ReturnType<typeof transition>): ChargeSnapshot {
  if (!r.ok) throw new Error(r.error.message);
  return r.charge;
}
