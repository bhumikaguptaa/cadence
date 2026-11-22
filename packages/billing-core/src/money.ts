/**
 * Money in Cadence is an integer number of micro-USDC (1 USDC = 1_000_000), held as a bigint.
 * Never a JS number: floats cannot represent 0.1 exactly. Over the wire it is a decimal string.
 *
 * Rules, all tested:
 *  - Parsing is strict. More than 6 decimals is an error; we never round user input.
 *  - Rounding exists in exactly one place: the explicit division helpers at the bottom.
 */

export const USDC_DECIMALS = 6 as const;
export const MICRO_PER_USDC = 1_000_000n;

/** Longest input we will even look at. Stops pathological strings before regex/BigInt work. */
const MAX_INPUT_LENGTH = 40;

export type MoneyErrorCode =
  'INVALID_FORMAT' | 'TOO_MANY_DECIMALS' | 'NEGATIVE_AMOUNT' | 'INVALID_ARGUMENT';

export class MoneyError extends Error {
  readonly code: MoneyErrorCode;
  constructor(code: MoneyErrorCode, message: string) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;
const WIRE_RE = /^(?:0|[1-9]\d*)$/;

/** "9.99" -> 9_990_000n. Rejects signs, exponents, separators, spaces and >6 decimals. */
export function parseUsdc(input: string): bigint {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_INPUT_LENGTH) {
    throw new MoneyError('INVALID_FORMAT', 'Amount must be a plain decimal string.');
  }
  const m = DECIMAL_RE.exec(input);
  if (!m) {
    throw new MoneyError('INVALID_FORMAT', `"${input}" is not a plain decimal amount.`);
  }
  const whole = m[1] ?? '';
  const frac = m[2] ?? '';
  if (frac.length > USDC_DECIMALS) {
    throw new MoneyError(
      'TOO_MANY_DECIMALS',
      `USDC has ${USDC_DECIMALS} decimals; "${input}" has ${frac.length}.`,
    );
  }
  return BigInt(whole) * MICRO_PER_USDC + BigInt(frac.padEnd(USDC_DECIMALS, '0') || '0');
}

export type FormatOptions = {
  /** Minimum digits after the point (0-6). Default 2, so 9_990_000n -> "9.99", 10_000_000n -> "10.00". */
  readonly minFractionDigits?: number;
};

/** 9_990_000n -> "9.99". Exact (no rounding): shows up to 6 decimals, trims trailing zeros. */
export function formatUsdc(micro: bigint, options: FormatOptions = {}): string {
  const min = options.minFractionDigits ?? 2;
  if (!Number.isInteger(min) || min < 0 || min > USDC_DECIMALS) {
    throw new MoneyError('INVALID_ARGUMENT', 'minFractionDigits must be an integer from 0 to 6.');
  }
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = (abs / MICRO_PER_USDC).toString();
  let frac = (abs % MICRO_PER_USDC).toString().padStart(USDC_DECIMALS, '0');
  while (frac.length > min && frac.endsWith('0')) frac = frac.slice(0, -1);
  return `${negative ? '-' : ''}${whole}${frac.length > 0 ? `.${frac}` : ''}`;
}

/** The decimal string the Base SDK expects for `recurringCharge` / `amount` (e.g. "9.99", "10"). */
export function toSdkAmount(micro: bigint): string {
  assertNonNegative(micro);
  return formatUsdc(micro, { minFractionDigits: 0 });
}

/** Integer micro-USDC as a decimal string for JSON. Non-negative only. */
export function toWireString(micro: bigint): string {
  assertNonNegative(micro);
  return micro.toString();
}

/** Inverse of toWireString. Canonical form only: no sign, no decimals, no leading zeros. */
export function fromWireString(s: string): bigint {
  if (typeof s !== 'string' || s.length > MAX_INPUT_LENGTH || !WIRE_RE.test(s)) {
    throw new MoneyError('INVALID_FORMAT', 'Wire amount must be a non-negative integer string.');
  }
  return BigInt(s);
}

function assertNonNegative(n: bigint): void {
  if (n < 0n) throw new MoneyError('NEGATIVE_AMOUNT', 'Amount must not be negative.');
}

function checkDivision(n: bigint, d: bigint): void {
  assertNonNegative(n);
  if (d <= 0n) throw new MoneyError('INVALID_ARGUMENT', 'Divisor must be positive.');
}

// ---- Division helpers: the ONLY place rounding is allowed. Pick the direction on purpose. ----

/** Round down. Use when the result is something we owe or may spend ("at most"). */
export function divFloor(n: bigint, d: bigint): bigint {
  checkDivision(n, d);
  return n / d;
}

/** Round up. Use when the result is something we need ("at least"), e.g. a top-up. */
export function divCeil(n: bigint, d: bigint): bigint {
  checkDivision(n, d);
  return (n + d - 1n) / d;
}

/** Round to nearest; exact halves round UP (away from zero). Display/analytics only. */
export function divRoundHalfUp(n: bigint, d: bigint): bigint {
  checkDivision(n, d);
  return (2n * n + d) / (2n * d);
}
