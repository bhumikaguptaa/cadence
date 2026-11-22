import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';
import { colors, contrastPairs, merchantPalette } from './tokens';

describe('contrast math', () => {
  it('returns 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#1B3BFF', '#F3EFE6')).toBeCloseTo(
      contrastRatio('#F3EFE6', '#1B3BFF'),
      10,
    );
  });
  it('rejects malformed colors', () => {
    expect(() => relativeLuminance('red')).toThrow();
  });
});

describe('design tokens', () => {
  it.each(contrastPairs)('$name meets its minimum ratio', ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it.each(merchantPalette)('white monogram on %s is >= 3:1', (tile) => {
    expect(contrastRatio('#FFFFFF', tile)).toBeGreaterThanOrEqual(3);
  });

  it('merchant palette has no duplicates', () => {
    expect(new Set(merchantPalette).size).toBe(merchantPalette.length);
  });

  it('every TS color token appears in tokens.css', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').toLowerCase();
    for (const hex of Object.values(colors)) expect(css).toContain(hex.toLowerCase());
  });

  /**
   * KNOWN DESIGN CONFLICT (docs/DESIGN_CONFLICTS.md #1): the covered green and the heads-up amber
   * have almost identical lightness, so they cannot be told apart by lightness alone.
   * This test pins the fact so nobody assumes color alone separates them; the rhythm strip must
   * add a non-color cue (hatching + text label) to uncovered segments.
   */
  it('documents that covered green and heads-up amber are NOT separable by lightness', () => {
    expect(contrastRatio(colors.covered, colors.headsUpBar)).toBeLessThan(1.2);
  });
});
