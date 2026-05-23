import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
}

export function Card({
  title,
  description,
  footer,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border border-outline-variant bg-surface-container p-4 shadow-sm',
        className,
      )}
      {...rest}
    >
      {(title || description) && (
        <header className="mb-3">
          {title && <h3 className="text-sm font-semibold text-on-surface">{title}</h3>}
          {description && (
            <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>
          )}
        </header>
      )}
      {children && <div className="text-sm text-on-surface">{children}</div>}
      {footer && (
        <footer className="mt-3 border-t border-outline-variant pt-3 text-xs text-on-surface-variant">
          {footer}
        </footer>
      )}
    </div>
  );
}
