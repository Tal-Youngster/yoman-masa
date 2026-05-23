import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';

import { cn } from './cn';
import { CURRENCIES, findCurrency } from '@/lib/currency/list';

export interface CurrencyPickerProps {
  /** Selected ISO 4217 currency code. */
  value: string;
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
  /** Forwarded to the trigger button — useful for tests. */
  'data-testid'?: string;
  error?: string;
}

export function CurrencyPicker({
  value,
  onChange,
  label = 'Currency',
  placeholder = 'Select currency…',
  'data-testid': testId,
  error,
}: CurrencyPickerProps): React.JSX.Element {
  const triggerId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(ev: MouseEvent): void {
      const t = ev.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function handleKey(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selected = useMemo(() => findCurrency(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [query]);

  function choose(code: string): void {
    onChange(code);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={triggerId} className="text-xs font-medium text-on-surface">
        {label}
      </label>

      <div className="relative">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          data-testid={testId}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border',
            'bg-surface-container-lowest px-2 py-1.5 text-left text-sm text-on-surface',
            'focus:outline-none focus:border-primary',
            error ? 'border-error' : 'border-outline-variant',
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <CurrencyFlag country={selected.country} />
              <span className="font-medium">{selected.code}</span>
              <span className="text-on-surface-variant">{selected.name}</span>
            </span>
          ) : value ? (
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
              <span className="font-medium">{value}</span>
            </span>
          ) : (
            <span className="text-on-surface-variant">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
        </button>

        {open && (
          <div
            ref={panelRef}
            role="listbox"
            className={cn(
              'absolute z-20 mt-1 max-h-72 w-full overflow-hidden rounded-lg border border-outline-variant',
              'bg-surface shadow-lg',
            )}
          >
            <div className="border-b border-outline-variant p-2">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search currency…"
                data-testid={testId ? `${testId}-search` : undefined}
                className="h-8 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-on-surface-variant">No matches.</li>
              ) : (
                filtered.map((c) => {
                  const isSelected = c.code === value.toUpperCase();
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => choose(c.code)}
                        data-testid={testId ? `${testId}-option-${c.code}` : undefined}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm',
                          isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'text-on-surface hover:bg-surface-container',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <CurrencyFlag country={c.country} />
                          <span className="font-medium">{c.code}</span>
                          <span className="text-on-surface-variant">{c.name}</span>
                        </span>
                        {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

function CurrencyFlag({ country }: { country: string | null }): React.JSX.Element {
  if (!country) {
    return <Globe className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />;
  }
  return (
    <span aria-hidden="true" className="inline-flex">
      <ReactCountryFlag countryCode={country} svg />
    </span>
  );
}
