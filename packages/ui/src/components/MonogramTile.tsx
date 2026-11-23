import { cx } from '../cx';
import { merchantColor } from '../merchantColor';

export type MonogramSize = 'sm' | 'md' | 'lg';

// The letter is always >= 24px so white-on-tile only needs 3:1 (WCAG "large text"). Every palette color passes.
const SIZE_CLASS: Record<MonogramSize, string> = {
  sm: 'size-9 text-[24px]',
  md: 'size-11 text-[26px]',
  lg: 'size-16 text-[36px]',
};

export type MonogramTileProps = {
  /** Merchant display name. Its first letter is the monogram. */
  readonly name: string;
  /** Stable merchant id: the same id always gets the same color. Defaults to the name. */
  readonly id?: string;
  readonly size?: MonogramSize;
  /** Decorative by default (the name is usually printed next to it). Set false to expose it as an image with the name. */
  readonly decorative?: boolean;
  readonly className?: string;
};

/** First user-perceived character, uppercased; "?" if the name is empty. Handles emoji and non-Latin scripts. */
export function monogramLetter(name: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const iterator = segmenter.segment(name.trim())[Symbol.iterator]();
  const first = iterator.next();
  const letter = first.done ? '' : first.value.segment;
  return letter === '' ? '?' : letter.toLocaleUpperCase();
}

export function MonogramTile({
  name,
  id,
  size = 'md',
  decorative = true,
  className,
}: MonogramTileProps) {
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name };
  return (
    <span
      {...a11y}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-serif leading-none text-white',
        SIZE_CLASS[size],
        className,
      )}
      style={{ background: merchantColor(id ?? name) }}
    >
      {monogramLetter(name)}
    </span>
  );
}
