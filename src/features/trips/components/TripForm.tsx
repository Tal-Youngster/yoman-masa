import { useEffect, useState, useId } from 'react';

import { Button, Input } from '@/ui/components';
import type { Trip } from '@/domain/trip';
import { useAppServices } from '@/app/use-app-services';
import { deriveSlug, suggestUniqueSlug } from '../slug';
import { CountriesPicker } from './CountriesPicker';

export interface TripFormProps {
  /** When provided, the form is in edit mode and the slug field is read-only. */
  initial?: Trip;
  /** Called after the mutation succeeds. */
  onSuccess?: (trip: { id: string; slug: string }) => void;
  /** Called when the user clicks Cancel. */
  onCancel?: () => void;
}

interface Errors {
  name?: string;
  slug?: string;
  start_date?: string;
  end_date?: string;
  home_currency?: string;
  submit?: string;
}

export function TripForm({ initial, onSuccess, onCancel }: TripFormProps): React.JSX.Element {
  const { tripsAdmin } = useAppServices();
  const formId = useId();

  const [name, setName] = useState(initial?.name ?? '');
  // For create, slug auto-derives from name. The user cannot override (kept
  // simple for v1; the suggestUniqueSlug call handles collisions silently).
  const [slug, setSlug] = useState<string>(initial?.slug ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const [homeCurrency, setHomeCurrency] = useState(initial?.home_currency ?? 'USD');
  const [countryCodes, setCountryCodes] = useState<string[]>(initial?.country_codes ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const isEdit = initial !== undefined;

  // Live slug preview for create mode.
  useEffect(() => {
    if (isEdit) return;
    if (name.trim().length === 0) {
      setSlug('');
      return;
    }
    setSlug(deriveSlug(name));
  }, [name, isEdit]);

  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!isEdit && !slug) e.slug = 'Slug could not be derived';
    if (!startDate) e.start_date = 'Start date is required';
    if (!endDate) e.end_date = 'End date is required';
    if (startDate && endDate && startDate > endDate) {
      e.end_date = 'End date must be on or after start date';
    }
    if (!/^[A-Z]{3}$/.test(homeCurrency)) {
      e.home_currency = 'Use a 3-letter currency code (e.g. USD)';
    }
    return e;
  }

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    if (!tripsAdmin) {
      setErrors({ submit: 'Trips service not configured (set up Drive first).' });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      if (isEdit && initial) {
        await tripsAdmin.updateTrip({
          id: initial.id,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          home_currency: homeCurrency,
          country_codes: countryCodes,
          notes,
        });
        onSuccess?.({ id: initial.id, slug: initial.slug });
      } else {
        const uniqueSlug = await suggestUniqueSlug(name.trim());
        const created = await tripsAdmin.createTrip({
          name: name.trim(),
          slug: uniqueSlug,
          start_date: startDate,
          end_date: endDate,
          home_currency: homeCurrency,
          country_codes: countryCodes,
          notes,
        });
        onSuccess?.(created);
      }
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form id={formId} onSubmit={(ev) => void handleSubmit(ev)} className="flex flex-col gap-3">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Kyoto 2026"
        autoFocus
        data-testid="trip-form-name"
        {...(errors.name ? { error: errors.name } : {})}
      />
      <div className="text-xs text-on-surface-variant">
        Slug (immutable): <code data-testid="trip-form-slug">{slug || '—'}</code>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Start date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          data-testid="trip-form-start"
          {...(errors.start_date ? { error: errors.start_date } : {})}
        />
        <Input
          label="End date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          data-testid="trip-form-end"
          {...(errors.end_date ? { error: errors.end_date } : {})}
        />
      </div>
      <Input
        label="Home currency"
        value={homeCurrency}
        onChange={(e) => setHomeCurrency(e.target.value.toUpperCase())}
        maxLength={3}
        placeholder="USD"
        data-testid="trip-form-currency"
        {...(errors.home_currency ? { error: errors.home_currency } : {})}
      />
      <CountriesPicker value={countryCodes} onChange={setCountryCodes} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${formId}-notes`} className="text-xs font-medium text-on-surface">
          Notes
        </label>
        <textarea
          id={`${formId}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          data-testid="trip-form-notes"
          className="rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-on-surface"
        />
      </div>

      {errors.submit && (
        <p role="alert" className="text-xs text-red-400" data-testid="trip-form-submit-error">
          {errors.submit}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting} data-testid="trip-form-submit">
          {submitting ? 'Saving…' : isEdit ? 'Save' : 'Create trip'}
        </Button>
      </div>
    </form>
  );
}
