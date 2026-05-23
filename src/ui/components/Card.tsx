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
        'rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm',
        className,
      )}
      {...rest}
    >
      {(title || description) && (
        <header className="mb-3">
          {title && <h3 className="text-sm font-semibold text-slate-100">{title}</h3>}
          {description && (
            <p className="mt-0.5 text-xs text-slate-400">{description}</p>
          )}
        </header>
      )}
      {children && <div className="text-sm text-slate-200">{children}</div>}
      {footer && (
        <footer className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
          {footer}
        </footer>
      )}
    </div>
  );
}
