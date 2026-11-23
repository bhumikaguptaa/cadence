import { formatUsdc } from '@cadence/billing-core';
import { cx } from '../cx';
import { groupThousands } from '../format';

export type MoneyTextProps = {
  /** Integer micro-USDC (1 USDC = 1_000_000). Never a float. */
  readonly micro: bigint;
  /** Minimum decimals shown (0-6). Default 2: "$9.99", "$10.00". Extra digits appear only if the amount needs them. */
  readonly minFractionDigits?: number;
  /** Append a muted " USDC" unit. */
  readonly showUnit?: boolean;
  readonly className?: string;
};

/** Money as text, with tabular figures so columns line up. Exact: it never rounds. */
export function MoneyText({
  micro,
  minFractionDigits,
  showUnit = false,
  className,
}: MoneyTextProps) {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const formatted = formatUsdc(abs, minFractionDigits === undefined ? {} : { minFractionDigits });
  const [whole = '0', fraction] = formatted.split('.');
  const text = `${groupThousands(whole)}${fraction === undefined ? '' : `.${fraction}`}`;
  return (
    <span className={cx('tabular', className)}>
      {negative ? '−' : ''}${text}
      {showUnit ? <span className="text-muted"> USDC</span> : null}
    </span>
  );
}
