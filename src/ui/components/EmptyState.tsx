import { cn } from './cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Optional CTA(s) rendered under the description. */
  action?: React.ReactNode;
  className?: string;
}

/** Friendly, centered placeholder for "nothing here yet" surfaces. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </span>
      )}
      <div>
        <h3 className="text-headline-sm text-on-surface">{title}</h3>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-on-surface-variant">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
