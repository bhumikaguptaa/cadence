import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { merchantColor, merchantColorIndex } from './merchantColor';
import { merchantPalette } from './tokens';

describe('merchantColor', () => {
  it('is stable: pinned values never change between releases', () => {
    // If these change, every merchant's color changes for every user. Update deliberately or not at all.
    // '' and 'a' match the published FNV-1a 32-bit vectors (0x811c9dc5 % 8 = 5, 0xe40c292c % 8 = 4).
    // 'studio-notes' is a regression pin of the current output, not independently derived.
    expect([
      merchantColorIndex(''),
      merchantColorIndex('a'),
      merchantColorIndex('studio-notes'),
    ]).toEqual([5, 4, 7]);
  });

  it('always returns a palette color', () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        const i = merchantColorIndex(id);
        expect(Number.isInteger(i) && i >= 0 && i < merchantPalette.length).toBe(true);
        expect(merchantPalette).toContain(merchantColor(id));
      }),
    );
  });

  it('spreads typical ids across the palette (not all one color)', () => {
    const used = new Set(
      Array.from({ length: 200 }, (_, n) => merchantColorIndex(`merchant-${n}`)),
    );
    expect(used.size).toBe(merchantPalette.length);
  });
});
