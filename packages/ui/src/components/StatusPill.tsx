import type { ReactNode } from 'react';
import { cx } from '../cx';

export type PillStatus =
  | 'active'
  | 'scheduled'
  | 'pending'
  | 'succeeded'
  | 'past_due'
  | 'failed'
  | 'needs_review'
  | 'canceled'
  | 'expired';

type Tone = 'success' | 'heads-up' | 'danger' | 'neutral';

const svg = (children: ReactNode) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);
const icons = {
  check: svg(<path d="M2.5 7.5l3 3 6-7" />),
  clock: svg(
    <>
      <circle cx="7" cy="7" r="5.25" />
      <path d="M7 4v3.25l2 1.25" />
    </>,
  ),
  alert: svg(
    <>
      <path d="M7 2.25l5.25 9.5H1.75z" />
      <path d="M7 6v2.5M7 10.4v.1" />
    </>,
  ),
  cross: svg(<path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />),
  dash: svg(<path d="M3 7h8" />),
};

/** Every status has a text label AND a distinct icon, so meaning never depends on color alone. */
const CONFIG: Record<PillStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  active: { label: 'Active', tone: 'success', icon: icons.check },
  succeeded: { label: 'Paid', tone: 'success', icon: icons.check },
  scheduled: { label: 'Scheduled', tone: 'neutral', icon: icons.clock },
  pending: { label: 'Pending', tone: 'heads-up', icon: icons.clock },
  past_due: { label: 'Past due', tone: 'heads-up', icon: icons.alert },
  needs_review: { label: 'Needs review', tone: 'heads-up', icon: icons.alert },
  failed: { label: 'Failed', tone: 'danger', icon: icons.cross },
  canceled: { label: 'Canceled', tone: 'neutral', icon: icons.dash },
  expired: { label: 'Expired', tone: 'neutral', icon: icons.dash },
};

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success-pill-bg text-success-pill-text border-transparent',
  'heads-up': 'bg-headsup-bg text-headsup-text border-headsup-border',
  danger: 'bg-surface text-danger border-danger',
  neutral: 'bg-divider text-ink-2 border-line',
};

export type StatusPillProps = {
  readonly status: PillStatus;
  readonly className?: string;
};

export function StatusPill({ status, className }: StatusPillProps) {
  const { label, tone, icon } = CONFIG[status];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium',
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

export const PILL_STATUSES = Object.keys(CONFIG) as readonly PillStatus[];
