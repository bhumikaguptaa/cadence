import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  divCeil,
  divFloor,
  divRoundHalfUp,
  formatUsdc,
  fromWireString,
  parseUsdc,
  toSdkAmount,
  toWireString,
} from './money';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MoneyError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

describe('parseUsdc', () => {
  it.each([
    ['0', 0n],
    ['1', 1_000_000n],
    ['9.99', 9_990_000n],
    ['9.9', 9_900_000n],
    ['0.000001', 1n],
    ['0.5', 500_000n],
    ['1234567.123456', 1_234_567_123_456n],
    ['007', 7_000_000n],
  ])('parses %s', (input, expected) => {
    expect(parseUsdc(input)).toBe(expected);
  });

  it('rejects more than 6 decimals with TOO_MANY_DECIMALS and never rounds', () => {
    expect(codeOf(() => parseUsdc('0.0000001'))).toBe('TOO_MANY_DECIMALS');
    expect(codeOf(() => parseUsdc('9.9999995'))).toBe('TOO_MANY_DECIMALS');
    expect(codeOf(() => parseUsdc('1.1234560'))).toBe('TOO_MANY_DECIMALS'); // even trailing zeros
  });

  it.each([
    '',
    ' ',
    '1 ',
    ' 1',
    '-1',
    '+1',
    '1e3',
    '1E3',
    '0x10',
    '1,000',
    '.5',
    '5.',
    '1..2',
    'abc',
    '१२',
  ])('rejects malformed input %j with INVALID_FORMAT', (input) => {
    expect(codeOf(() => parseUsdc(input))).toBe('INVALID_FORMAT');
  });

  it('rejects absurdly long input', () => {
    expect(codeOf(() => parseUsdc('1'.repeat(60)))).toBe('INVALID_FORMAT');
  });

  it('rejects non-strings (e.g. a JS number, which could be a float)', () => {
    expect(codeOf(() => parseUsdc(9.99 as unknown as string))).toBe('INVALID_FORMAT');
  });
});

describe('formatUsdc', () => {
  it.each([
    [0n, '0.00'],
    [1n, '0.000001'],
    [10n, '0.00001'],
    [500_000n, '0.50'],
    [9_990_000n, '9.99'],
    [10_000_000n, '10.00'],
    [1_234_567_123_456n, '1234567.123456'],
    [-2_890_000n, '-2.89'],
  ])('formats %s as %s', (micro, expected) => {
    expect(formatUsdc(micro)).toBe(expected);
  });

  it('honors minFractionDigits', () => {
    expect(formatUsdc(10_000_000n, { minFractionDigits: 0 })).toBe('10');
    expect(formatUsdc(9_900_000n, { minFractionDigits: 0 })).toBe('9.9');
    expect(formatUsdc(5n, { minFractionDigits: 6 })).toBe('0.000005');
  });

  it('rejects invalid minFractionDigits', () => {
    expect(codeOf(() => formatUsdc(1n, { minFractionDigits: 7 }))).toBe('INVALID_ARGUMENT');
    expect(codeOf(() => formatUsdc(1n, { minFractionDigits: -1 }))).toBe('INVALID_ARGUMENT');
    expect(codeOf(() => formatUsdc(1n, { minFractionDigits: 1.5 }))).toBe('INVALID_ARGUMENT');
  });

  it('property: parse(format(x)) === x for any non-negative amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 24n }), (x) => {
        expect(parseUsdc(formatUsdc(x))).toBe(x);
        expect(parseUsdc(formatUsdc(x, { minFractionDigits: 0 }))).toBe(x);
      }),
    );
  });

  it('property: format(parse(s)) is numerically equal to s for any valid decimal string', () => {
    const decimal = fc
      .tuple(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.integer({ min: 0, max: 999_999 }))
      .map(([whole, frac]) => `${whole}.${String(frac).padStart(6, '0')}`);
    fc.assert(
      fc.property(decimal, (s) => {
        expect(parseUsdc(formatUsdc(parseUsdc(s)))).toBe(parseUsdc(s));
      }),
    );
  });
});

describe('toSdkAmount', () => {
  it('produces the minimal decimal string the SDK expects (max 6 decimals)', () => {
    expect(toSdkAmount(9_990_000n)).toBe('9.99');
    expect(toSdkAmount(10_000_000n)).toBe('10');
    expect(toSdkAmount(1n)).toBe('0.000001');
  });
  it('rejects negative amounts', () => {
    expect(codeOf(() => toSdkAmount(-1n))).toBe('NEGATIVE_AMOUNT');
  });
});

describe('wire strings', () => {
  it('round-trips integers', () => {
    expect(toWireString(123n)).toBe('123');
    expect(fromWireString('123')).toBe(123n);
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), (x) => {
        expect(fromWireString(toWireString(x))).toBe(x);
      }),
    );
  });
  it('rejects negatives, decimals, signs, exponents, empties and leading zeros', () => {
    for (const bad of ['-1', '1.5', '+1', '1e3', '', '01', ' 1']) {
      expect(codeOf(() => fromWireString(bad))).toBe('INVALID_FORMAT');
    }
    expect(fromWireString('0')).toBe(0n);
  });
  it('refuses to serialize negative values', () => {
    expect(codeOf(() => toWireString(-1n))).toBe('NEGATIVE_AMOUNT');
  });
});

describe('division helpers (the only place rounding is allowed)', () => {
  it.each([
    // n, d, floor, ceil, halfUp
    [10n, 5n, 2n, 2n, 2n], // exact
    [7n, 2n, 3n, 4n, 4n], // 3.5 rounds up
    [5n, 3n, 1n, 2n, 2n], // 1.67
    [4n, 3n, 1n, 2n, 1n], // 1.33
    [1n, 3n, 0n, 1n, 0n],
    [0n, 7n, 0n, 0n, 0n],
    [1n, 2n, 0n, 1n, 1n], // 0.5 rounds up
    [3n, 2n, 1n, 2n, 2n], // 1.5 rounds up
  ])('%s / %s', (n, d, floor, ceil, half) => {
    expect(divFloor(n, d)).toBe(floor);
    expect(divCeil(n, d)).toBe(ceil);
    expect(divRoundHalfUp(n, d)).toBe(half);
  });

  it('rejects negative numerators and non-positive divisors', () => {
    for (const fn of [divFloor, divCeil, divRoundHalfUp]) {
      expect(codeOf(() => fn(-1n, 2n))).toBe('NEGATIVE_AMOUNT');
      expect(codeOf(() => fn(1n, 0n))).toBe('INVALID_ARGUMENT');
      expect(codeOf(() => fn(1n, -2n))).toBe('INVALID_ARGUMENT');
    }
  });

  it('property: floor <= halfUp <= ceil, ceil - floor <= 1, and floor*d <= n < (floor+1)*d', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 18n }),
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        (n, d) => {
          const f = divFloor(n, d);
          const c = divCeil(n, d);
          const h = divRoundHalfUp(n, d);
          expect(f <= h && h <= c).toBe(true);
          expect(c - f <= 1n).toBe(true);
          expect(f * d <= n && n < (f + 1n) * d).toBe(true);
          if (n % d === 0n) expect(f === c && c === h).toBe(true);
        },
      ),
    );
  });
});
