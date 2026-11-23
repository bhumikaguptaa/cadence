'use client';

import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from 'react';
import { cx } from '../cx';

export type ConsentSheetProps = {
  readonly open: boolean;
  /** Called for every way of dismissing: Esc, the close button, a tap on the scrim. The parent decides. */
  readonly onClose: () => void;
  /** Becomes the dialog's accessible name. */
  readonly title: string;
  readonly children: ReactNode;
  readonly showCloseButton?: boolean;
  readonly className?: string;
};

/**
 * Generic bottom sheet built on the native <dialog>: top layer, inert page behind, focus trapped, and focus
 * returns to the element that opened it. Controlled: `open` is the single source of truth, so a parent that
 * ignores `onClose` keeps the sheet open.
 */
export function ConsentSheet({
  open,
  onClose,
  title,
  children,
  showCloseButton = true,
  className,
}: ConsentSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      dialog.removeAttribute('data-closing'); // reopened mid-exit: cancel the exit
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;

    // Exit: play the ~180ms slide-down/fade (CSS, keyed on data-closing), THEN close(). Closing last keeps the
    // browser's native "focus returns to the opener" behavior. The timer is a safety net: if no animation runs
    // (hidden tab, animations disabled) the sheet still closes instead of getting stuck open.
    dialog.setAttribute('data-closing', '');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dialog.removeAttribute('data-closing');
      if (dialog.open) dialog.close();
    };
    const onEnd = (event: AnimationEvent) => {
      // Only the sheet's own animation, not the ::backdrop's.
      if (event.target === dialog && event.pseudoElement === '') finish();
    };
    dialog.addEventListener('animationend', onEnd);
    const safetyNet = window.setTimeout(finish, 400);
    return () => {
      dialog.removeEventListener('animationend', onEnd);
      window.clearTimeout(safetyNet);
    };
  }, [open]);

  // Real Esc raises a native "cancel". We stop the browser closing it itself and let the parent decide.
  const handleCancel = (event: SyntheticEvent) => {
    event.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx(
        'cd-sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[90dvh] w-full max-w-[32rem] overflow-y-auto',
        'rounded-b-none rounded-t-[32px] border border-b-0 border-line bg-sheet p-0 text-ink',
        className,
      )}
      onCancel={handleCancel}
      // Synthetic or assistive-tech Esc does not raise "cancel", so handle the key too. Idempotent for parents.
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      // The dialog has no padding, so a click whose target IS the dialog can only be a click on the scrim.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // Closed by something native (e.g. <form method="dialog">): tell the parent.
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className="relative p-6">
        <h2 id={titleId} className="pr-12 font-serif text-[28px] leading-tight">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        {showCloseButton ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-divider"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        ) : null}
      </div>
    </dialog>
  );
}
