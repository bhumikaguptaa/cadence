import { merchantPalette } from './tokens';

/**
 * One stable color per merchant: the same id always maps to the same palette entry, on every screen
 * and every device. FNV-1a (32-bit) over UTF-16 code units: tiny, fast, and well distributed for short ids.
 * Every palette color keeps a white monogram at >= 3:1 (checked in tokens.test.ts).
 */
export function merchantColorIndex(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % merchantPalette.length;
}

export function merchantColor(id: string): string {
  return merchantPalette[merchantColorIndex(id)] ?? merchantPalette[0];
}
