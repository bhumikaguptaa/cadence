import { describe, expect, it } from 'vitest';
import { cx } from './cx';
import { groupThousands } from './format';

describe('groupThousands', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['1234567', '1,234,567'],
    ['100000000', '100,000,000'],
  ])('%s -> %s', (input, expected) => {
    expect(groupThousands(input)).toBe(expected);
  });
  it('rejects non-digits', () => {
    expect(() => groupThousands('-1')).toThrow();
    expect(() => groupThousands('1.5')).toThrow();
  });
});

describe('cx', () => {
  it('joins truthy strings and skips the rest', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});
