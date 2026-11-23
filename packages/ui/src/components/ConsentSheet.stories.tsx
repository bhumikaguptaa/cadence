import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ConsentSheet } from './ConsentSheet';

const meta = {
  title: 'Components/ConsentSheet',
  component: ConsentSheet,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConsentSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A parent that owns the state, with a real trigger button, like the product screens will. */
function Demo({
  initiallyOpen = false,
  longContent = false,
  showCloseButton = true,
}: {
  initiallyOpen?: boolean;
  longContent?: boolean;
  showCloseButton?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="p-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[58px] rounded-full bg-cobalt px-8 font-semibold text-white"
      >
        Open sheet
      </button>
      <ConsentSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Studio Notes asks permission to charge you"
        showCloseButton={showCloseButton}
      >
        <p className="font-serif text-[40px] leading-none">$9.99 every 30 days</p>
        <p className="mt-3 text-ink-2">
          Studio Notes can take up to $9.99 every 30 days. Nothing more.
        </p>
        {longContent
          ? Array.from({ length: 24 }, (_, i) => (
              <p key={i} className="mt-3 text-ink-2">
                Guarantee {i + 1}: you can cancel any time and keep access until the period ends.
              </p>
            ))
          : null}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="h-[58px] rounded-full bg-cobalt font-semibold text-white"
          >
            Approve with passkey
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-11 font-medium text-ink-2"
          >
            Not now
          </button>
        </div>
      </ConsentSheet>
    </div>
  );
}

const dialogOf = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('dialog', {
    name: 'Studio Notes asks permission to charge you',
  }) as HTMLDialogElement;

export const Open: Story = {
  args: { open: true, onClose: fn(), title: 'Cancel Studio Notes?', children: 'Body' },
  render: () => <Demo initiallyOpen />,
  play: async ({ canvasElement }) => {
    const dialog = dialogOf(canvasElement);
    await expect(dialog).toBeVisible();
    await expect(dialog.open).toBe(true);
    // The first control inside the sheet has focus, not something behind it.
    await expect(dialog.contains(document.activeElement)).toBe(true);
  },
};

export const Closed: Story = {
  args: { open: false, onClose: fn(), title: 'Hidden', children: 'Body' },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('dialog')).toBeNull();
  },
};

export const FocusReturnsAfterEsc: Story = {
  args: { open: false, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });
    await userEvent.click(trigger);
    const dialog = dialogOf(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));
    await expect(dialog.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(trigger).toHaveFocus();
  },
};

export const FocusReturnsAfterCloseButton: Story = {
  args: { open: false, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });
    await userEvent.click(trigger);
    const dialog = dialogOf(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(trigger).toHaveFocus();
  },
};

export const FocusReturnsAfterNotNow: Story = {
  args: { open: false, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });
    await userEvent.click(trigger);
    const dialog = dialogOf(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(trigger).toHaveFocus();
  },
};

/** The exit animation runs first (data-closing), then the dialog really closes and focus returns. */
export const ClosesWithAnExitAnimation: Story = {
  args: { open: false, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });
    await userEvent.click(trigger);
    const dialog = dialogOf(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    // Mid-exit: still open, marked as closing, and not clickable.
    await expect(dialog.open).toBe(true);
    await expect(dialog.hasAttribute('data-closing')).toBe(true);
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(dialog.hasAttribute('data-closing')).toBe(false);
    await expect(trigger).toHaveFocus();
  },
};

/** Safety net: with animations disabled no animationend ever fires, yet the sheet must still close. */
export const ClosesEvenIfNoAnimationRuns: Story = {
  args: { open: false, onClose: fn(), title: 't', children: 'c' },
  render: () => (
    <>
      <style>{'.cd-sheet, .cd-sheet::backdrop { animation: none !important; }'}</style>
      <Demo />
    </>
  ),
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });
    await userEvent.click(trigger);
    const dialog = dialogOf(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.open).toBe(false), { timeout: 1500 });
    await expect(trigger).toHaveFocus();
  },
};

/** Reopening during the exit cancels it: the sheet stays open and usable. */
export const ReopeningDuringExitKeepsItOpen: Story = {
  args: { open: false, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });
    await userEvent.click(trigger);
    const dialog = dialogOf(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await expect(dialog.hasAttribute('data-closing')).toBe(true);
    // The exit is running; the page behind is inert, so reopen the way the app would: programmatically.
    trigger.click();
    await new Promise((r) => setTimeout(r, 600));
    await expect(dialog.open).toBe(true);
    await expect(dialog.hasAttribute('data-closing')).toBe(false);
  },
};

export const ScrimClickCloses: Story = {
  args: { open: false, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });
    await userEvent.click(trigger);
    const dialog = dialogOf(canvasElement);
    await waitFor(() => expect(dialog.open).toBe(true));

    // A click whose target is the <dialog> itself is a click on the scrim (the dialog has no padding).
    dialog.click();
    await waitFor(() => expect(dialog.open).toBe(false));
    await expect(trigger).toHaveFocus();
  },
};

export const ClickInsideDoesNotClose: Story = {
  args: { open: true, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo initiallyOpen />,
  play: async ({ canvasElement }) => {
    const dialog = dialogOf(canvasElement);
    await userEvent.click(within(dialog).getByText('$9.99 every 30 days'));
    await expect(dialog.open).toBe(true);
  },
};

/**
 * A native modal makes the page behind inert. We assert the guarantee the platform actually gives:
 * focus can reach the sheet's controls (or leave to browser UI, where activeElement is <body>), but it can
 * never land on anything in the page behind, by Tab or by script.
 */
export const PageBehindTheSheetCannotTakeFocus: Story = {
  args: { open: true, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo initiallyOpen />,
  play: async ({ canvasElement }) => {
    const dialog = dialogOf(canvasElement);
    const trigger = within(canvasElement).getByRole('button', { name: 'Open sheet' });

    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      const active = document.activeElement;
      await expect(active === document.body || dialog.contains(active)).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await userEvent.tab({ shift: true });
      const active = document.activeElement;
      await expect(active === document.body || dialog.contains(active)).toBe(true);
    }

    trigger.focus();
    await expect(document.activeElement).not.toBe(trigger);
  },
};

/** Content taller than the screen scrolls inside the sheet; the title and close button stay reachable. */
export const LongContentScrolls: Story = {
  args: { open: true, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo initiallyOpen longContent />,
  play: async ({ canvasElement }) => {
    const dialog = dialogOf(canvasElement);
    await expect(dialog.scrollHeight).toBeGreaterThan(dialog.clientHeight);
    await expect(dialog.getBoundingClientRect().height).toBeLessThanOrEqual(window.innerHeight);
  },
};

export const WithoutCloseButton: Story = {
  args: { open: true, onClose: fn(), title: 't', children: 'c' },
  render: () => <Demo initiallyOpen showCloseButton={false} />,
  play: async ({ canvasElement }) => {
    const dialog = dialogOf(canvasElement);
    await expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    // Esc still works.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.open).toBe(false));
  },
};
