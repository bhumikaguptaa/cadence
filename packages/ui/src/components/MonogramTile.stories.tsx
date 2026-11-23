import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { merchantPalette } from '../tokens';
import { MonogramTile, monogramLetter } from './MonogramTile';

const meta = {
  title: 'Components/MonogramTile',
  component: MonogramTile,
  args: { name: 'Studio Notes' },
} satisfies Meta<typeof MonogramTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('S')).toBeInTheDocument();
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <MonogramTile name="Studio Notes" size="sm" />
      <MonogramTile name="Studio Notes" size="md" />
      <MonogramTile name="Studio Notes" size="lg" />
    </div>
  ),
};

/** Labeled (not decorative): exposed to assistive tech as an image named after the merchant. */
export const Labeled: Story = {
  args: { decorative: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Studio Notes' })).toBeVisible();
  },
};

/** Same id, same color, everywhere: two tiles with different display names but one id match. */
export const StableColor: Story = {
  render: () => (
    <div className="flex gap-3">
      <MonogramTile name="Studio Notes" id="m_123" />
      <MonogramTile name="Studio Notes (renamed)" id="m_123" />
    </div>
  ),
};

/** Every palette color with a white letter. Contrast is checked by axe and by tokens.test.ts. */
export const WholePalette: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-3">
      {merchantPalette.map((_, i) => (
        <li key={i}>
          <MonogramTile name={String.fromCharCode(65 + i)} id={`palette-${i}`} size="lg" />
        </li>
      ))}
    </ul>
  ),
};

/** Awkward names: lowercase, accented, CJK, emoji, empty, leading spaces, very long. */
export const AwkwardNames: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-3">
      {['lowercase', 'éclair', '日本語', '🎵 Tunes', '', '   padded', 'A'.repeat(200)].map(
        (n, i) => (
          <li key={i}>
            <MonogramTile name={n} id={`awk-${i}`} />
          </li>
        ),
      )}
    </ul>
  ),
  play: async () => {
    await expect(monogramLetter('lowercase')).toBe('L');
    await expect(monogramLetter('éclair')).toBe('É');
    await expect(monogramLetter('日本語')).toBe('日');
    await expect(monogramLetter('🎵 Tunes')).toBe('🎵');
    await expect(monogramLetter('')).toBe('?');
    await expect(monogramLetter('   padded')).toBe('P');
  },
};
