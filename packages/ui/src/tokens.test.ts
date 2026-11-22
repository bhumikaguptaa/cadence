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
   * DESIGN DECISION (ADR-004, docs/DESIGN_NOTES.md): the original heads-up bar (#C77700) has the
   * same lightness as the covered green (1.03:1), so color alone cannot separate them. We pin that
   * fact, require a non-color cue (hatch + label) on uncovered segments, and use amberInk for thin
   * amber strokes/text, which does differ in lightness from the covered green.
   */
  it('pins that the original amber bar is NOT separable from covered green by lightness', () => {
    expect(contrastRatio(colors.covered, colors.headsUpBar)).toBeLessThan(1.2);
  });

  it('amber ink differs from covered green in lightness (>= 1.5:1)', () => {
    expect(contrastRatio(colors.covered, colors.amberInk)).toBeGreaterThanOrEqual(1.5);
  });
});
