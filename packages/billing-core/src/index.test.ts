import { describe, expect, it } from 'vitest';
import { MICRO_PER_USDC, USDC_DECIMALS } from './index';

describe('constants', () => {
  it('keeps decimals and the micro multiplier consistent', () => {
    expect(MICRO_PER_USDC).toBe(10n ** BigInt(USDC_DECIMALS));
  });
});
