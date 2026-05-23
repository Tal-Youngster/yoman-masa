import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

import { cn } from '@/ui/components/cn';
import ReactCountryFlag from 'react-country-flag';
import { COUNTRIES, countryName } from '../countries';

export interface CountriesPickerProps {
  /** Selected ISO 3166-1 alpha-2 codes. */
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  placeholder?: string;
}

export function CountriesPicker({
  value,
  onChange,
  label = 'Countries',
  placeholder = 'Add country…',
}: CountriesPickerProps): React.JSX.Element {
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

  const selectedSet = useMemo(() => new Set(value.map((c) => c.toUpperCase())), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [query]);

  function toggle(code: string): void {
    if (selectedSet.has(code)) {
      onChange(value.filter((c) => c.toUpperCase() !== code));
    } else {
      onChange([...value, code]);
    }
  }

  function remove(code: string): void {
    onChange(value.filter((c) => c.toUpperCase() !== code.toUpperCase()));
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
          data-testid="trip-form-countries-trigger"
          className={cn(
            'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-outline-variant',
            'bg-surface-container-lowest px-2 py-1.5 text-left text-sm text-on-surface',
            'focus:outline-none focus:border-primary',
          )}
        >
          {value.length === 0 ? (
            <span className="text-on-surface-variant">{placeholder}</span>
          ) : (
            value.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-xs"
                data-testid={`trip-form-country-chip-${code}`}
              >
                <span aria-hidden="true" className="inline-flex">
                  <ReactCountryFlag countryCode={code} svg />
                </span>
                <span>{countryName(code)}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${countryName(code)}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    remove(code);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      ev.stopPropagation();
                      remove(code);
                    }
                  }}
                  className="ml-0.5 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface"
                >
                  <X className="h-3 w-3" />
                </span>
              </span>
            ))
          )}
        </button>

        {open && (
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable="true"
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
                placeholder="Search countries…"
                data-testid="trip-form-countries-search"
                className="h-8 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-on-surface-variant">No matches.</li>
              ) : (
                filtered.map((c) => {
                  const selected = selectedSet.has(c.code);
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => toggle(c.code)}
                        data-testid={`trip-form-country-option-${c.code}`}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm',
                          selected
                            ? 'bg-primary/10 text-primary'
                            : 'text-on-surface hover:bg-surface-container',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true" className="text-base inline-flex">
                            <ReactCountryFlag countryCode={c.code} svg />
                          </span>
                          <span>{c.name}</span>
                          <span className="text-xs text-on-surface-variant">{c.code}</span>
                        </span>
                        {selected && <Check className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
