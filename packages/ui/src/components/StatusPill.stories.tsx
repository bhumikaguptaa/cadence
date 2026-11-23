import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { PILL_STATUSES, StatusPill } from './StatusPill';

const meta = {
  title: 'Components/StatusPill',
  component: StatusPill,
  args: { status: 'active' },
} satisfies Meta<typeof StatusPill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Active')).toBeVisible();
  },
};
export const PastDue: Story = { args: { status: 'past_due' } };
export const Failed: Story = { args: { status: 'failed' } };
export const NeedsReview: Story = { args: { status: 'needs_review' } };
export const Canceled: Story = { args: { status: 'canceled' } };

/** Every status side by side. Each has its own label and icon, so none relies on color alone. */
export const AllStatuses: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-3">
      {PILL_STATUSES.map((s) => (
        <li key={s}>
          <StatusPill status={s} />
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    for (const label of [
      'Active',
      'Paid',
      'Scheduled',
      'Pending',
      'Past due',
      'Needs review',
      'Failed',
      'Canceled',
      'Expired',
    ]) {
      await expect(c.getByText(label)).toBeVisible();
    }
  },
};

/** Narrow container: the pill never wraps its label onto two lines. */
export const NarrowContainer: Story = {
  args: { status: 'needs_review' },
  decorators: [
    (Story) => (
      <div className="w-32 overflow-hidden">
        <Story />
      </div>
    ),
  ],
};
