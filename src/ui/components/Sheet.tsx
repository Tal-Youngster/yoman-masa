import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';

export type SheetSide = 'bottom' | 'right';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  title?: ReactNode;
  /** Extra action buttons rendered in the header, next to the close button. */
  headerActions?: ReactNode;
  children: ReactNode;
  /** Accessible label when no visible title is provided. */
  'aria-label'?: string;
}

/**
 * Lightweight modal-sheet primitive. Uses native <dialog> so the browser handles
 * focus trapping and the inert backdrop. Side controls whether it docks to the
 * bottom (mobile) or right edge (desktop / wide trip switcher).
 */
export function Sheet({
  open,
  onClose,
  side = 'bottom',
  title,
  headerActions,
  children,
  ...rest
}: SheetProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        // Close when clicking the backdrop (the dialog element itself, not its children)
        if (e.target === dialogRef.current) onClose();
      }}
      aria-label={rest['aria-label']}
      className={cn(
        'bg-transparent text-on-surface backdrop:bg-black/30',
        'p-0 m-0 max-w-none',
        side === 'bottom'
          ? 'mt-auto mb-0 w-full max-h-[90dvh] sm:max-w-md sm:rounded-t-2xl'
          : 'ml-auto mr-0 h-full max-h-none w-full max-w-sm',
      )}
    >
      <div
        className={cn(
          'flex h-full flex-col border border-outline-variant bg-surface shadow-xl',
          side === 'bottom' ? 'rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'rounded-l-2xl',
        )}
      >
        {title && (
          <header className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
            <div className="flex items-center gap-1">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              >
                ×
              </button>
            </div>
          </header>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}
