import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = error || hint ? `${inputId}-describe` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-on-surface">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          'h-10 rounded-lg border bg-surface-container-lowest px-3 text-sm text-on-surface placeholder:text-on-surface-variant',
          'focus:outline-none focus:ring-2 focus:ring-primary',
          error ? 'border-error' : 'border-outline-variant',
          className,
        )}
        {...rest}
      />
      {(error || hint) && (
        <p
          id={describedById}
          className={cn('text-xs', error ? 'text-error' : 'text-on-surface-variant')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
