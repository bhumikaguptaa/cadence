import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { MoneyText } from './MoneyText';

const meta = {
  title: 'Components/MoneyText',
  component: MoneyText,
  args: { micro: 9_990_000n },
} satisfies Meta<typeof MoneyText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('$9.99')).toBeVisible();
  },
};
export const WholeAmount: Story = { args: { micro: 10_000_000n } };
export const Zero: Story = {
  args: { micro: 0n },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('$0.00')).toBeVisible();
  },
};
export const SmallestUnit: Story = {
  args: { micro: 1n },
  play: async ({ canvasElement }) => {
    // One micro-USDC is shown exactly, never rounded to $0.00.
    await expect(within(canvasElement).getByText('$0.000001')).toBeVisible();
  },
};
export const Large: Story = {
  args: { micro: 1_234_567_890_000n },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('$1,234,567.89')).toBeVisible();
  },
};
export const Negative: Story = {
  args: { micro: -2_890_000n },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('−$2.89')).toBeVisible();
  },
};
export const WithUnit: Story = { args: { micro: 63_200_000n, showUnit: true } };
export const NoDecimals: Story = { args: { micro: 10_000_000n, minFractionDigits: 0 } };
export const Hero: Story = {
  args: { micro: 63_200_000n, className: 'font-serif text-8xl' },
};

/** Tabular figures: digits are equal width, so decimal points line up in a column. */
export const ColumnAlignment: Story = {
  render: () => (
    <ul className="w-48 space-y-1 text-right text-lg">
      {[1_000_000n, 11_110_000n, 999_990_000n, 88_880_000n].map((m) => (
        <li key={m.toString()} className="border-b border-divider">
          <MoneyText micro={m} />
        </li>
      ))}
    </ul>
  ),
};
