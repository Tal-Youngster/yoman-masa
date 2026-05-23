import { useState, useId, useMemo, useEffect, useCallback } from 'react';
import { Button, Input } from '@/ui/components';
import type { AccommodationStatus, AccommodationService} from '@/domain/accommodation';
import { Accommodation, newAccommodation } from '@/domain/accommodation';
import type { Trip } from '@/domain/trip';
import type { IsoDate } from '@/domain/dates';
import { getDatesBetween } from '@/domain/dates';
import { useAppServices } from '@/app/use-app-services';
import { upsertAccommodation } from '../queries';
import { accommodationFilePath } from '../paths';
import { ulid } from 'ulid';
import { asFileId } from '@/sync/drive';
import type { AiExtractedData } from './AiExtractionDialog';

export interface AccommodationFormProps {
  trip: Trip;
  initial?: Accommodation;
  aiData?: AiExtractedData;
  aiSource?: { url?: string; file?: File };
  onSuccess?: (acc: Accommodation) => void;
  onCancel?: () => void;
}

const STATUSES: AccommodationStatus[] = ['booked', 'wishlist', 'cancelled'];
const SERVICES: AccommodationService[] = ['airbnb', 'booking', 'hostelworld', 'agoda', 'direct', 'other'];

export function AccommodationForm({ trip, initial, aiData, aiSource, onSuccess, onCancel }: AccommodationFormProps): React.JSX.Element {
  const { drive, writeQueue, kv } = useAppServices();
  const formId = useId();

  const tripDates = useMemo(() => getDatesBetween(trip.start_date, trip.end_date), [trip]);

  // Determine initial dates from aiData if valid, otherwise fallback
  const aiCheckinValid = aiData?.checkin && tripDates.includes(aiData.checkin as IsoDate);
  const aiCheckoutValid = aiData?.checkout && tripDates.includes(aiData.checkout as IsoDate);
  
  const initialCheckin = aiCheckinValid ? (aiData.checkin as IsoDate) : trip.start_date;
  const initialCheckout = aiCheckoutValid ? (aiData.checkout as IsoDate) : trip.start_date;
  const showDateWarning = aiData && (!aiCheckinValid || !aiCheckoutValid) && (aiData.checkin || aiData.checkout);

  const [name, setName] = useState(initial?.name ?? aiData?.name ?? '');
  const [service, setService] = useState<AccommodationService>(initial?.service ?? aiData?.service ?? 'airbnb');
  const [serviceOtherLabel, setServiceOtherLabel] = useState(initial?.service_other_label ?? '');
  const [checkin, setCheckin] = useState(initial?.checkin ?? initialCheckin);
  const [checkout, setCheckout] = useState(initial?.checkout ?? initialCheckout);
  const [checkinTime, setCheckinTime] = useState(initial?.checkin_time ?? aiData?.checkin_time ?? '');
  const [checkoutTime, setCheckoutTime] = useState(initial?.checkout_time ?? aiData?.checkout_time ?? '');
  const [price, setPrice] = useState<string>(initial?.price?.toString() ?? aiData?.price?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? aiData?.currency ?? 'USD');
  const [address, setAddress] = useState(initial?.location?.address ?? aiData?.address ?? '');
  const [url, setUrl] = useState(initial?.url ?? aiSource?.url ?? aiData?.url ?? '');
  const [confirmation, setConfirmation] = useState(initial?.confirmation ?? aiData?.confirmation ?? '');
  const [status, setStatus] = useState<AccommodationStatus>(initial?.status ?? 'booked');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  
  // Attachments
  const [attachments, setAttachments] = useState<string[]>(initial?.attachments ?? []);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = initial !== undefined;

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const ext = file.name.split('.').pop() ?? 'bin';
      const filename = `${hashHex}.${ext}`;
      
      const folderIdStr = await kv.get('travel_folder_file_id');
      if (!folderIdStr) throw new Error('Travel folder not configured.');
      
      const resolvedPath = `Travel/attachments/${filename}`;
      
      if (!drive) throw new Error('Drive service not configured');
      
      await drive.createFile({
        parentId: asFileId(folderIdStr),
        name: filename,
        mimeType: file.type,
        mediaBytes: new Uint8Array(buffer),
        resolvedPath
      });
      
      setAttachments(prev => [...prev, resolvedPath]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }, [drive, kv]);

  useEffect(() => {
    // Auto-upload if user provided a file to the AI extractor
    if (aiSource?.file && !initial) {
      void uploadFile(aiSource.file);
    }
  }, [aiSource?.file, initial, uploadFile]);

  async function handleFileUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    ev.target.value = ''; // Reset input
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return setError('Name is required');
    if (!checkin || !checkout) return setError('Check-in and check-out dates are required');
    if (checkin > checkout) return setError('Check-in must be before check-out');
    if (service === 'other' && !serviceOtherLabel.trim()) return setError('Service label is required when "other" is selected');

    let finalUrl = url.trim();
    if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    setSubmitting(true);
    setError(null);
    try {
      const accData = {
        trip_id: trip.id,
        status,
        name: name.trim(),
        service,
        service_other_label: service === 'other' ? serviceOtherLabel.trim() : undefined,
        price: price.trim() ? Number(price) : undefined,
        currency: currency.trim() || undefined,
        confirmation: confirmation.trim() || undefined,
        checkin,
        checkout,
        checkin_time: checkinTime.trim() || undefined,
        checkout_time: checkoutTime.trim() || undefined,
        location: address.trim() ? { address: address.trim(), lat: 0, lng: 0 } : undefined,
        url: finalUrl || undefined,
        attachments,
        notes: notes.trim(),
      };

      let acc: Accommodation;
      let op: 'create' | 'update';

      if (isEdit && initial) {
        acc = Accommodation.parse({ ...initial, ...accData });
        op = 'update';
      } else {
        acc = newAccommodation(accData);
        op = 'create';
      }

      await upsertAccommodation(acc);

      const path = accommodationFilePath('Travel', trip.slug, acc.checkin, acc.name);

      if (!writeQueue) throw new Error('Write queue not configured');

      await writeQueue.enqueue({
        id: ulid(),
        entityType: 'accommodation',
        entityId: acc.id,
        op,
        payload: { accommodation: acc },
        baseRevision: null,
        fileId: null,
        resolvedPath: path,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
      });

      onSuccess?.(acc);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8 pt-2">
      <form id={formId} onSubmit={(ev) => void handleSubmit(ev)} className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
        
        {/* Custom Date Selectors */}
        <div className="flex flex-col gap-4 bg-surface-container-low p-3 rounded-xl">
          {showDateWarning && (
            <div className="bg-orange-500/10 text-orange-600 dark:text-orange-400 p-2 rounded-lg text-xs font-medium">
              Extracted dates ({aiData.checkin} - {aiData.checkout}) are outside your trip dates.
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">Check-in</label>
            <div className="flex overflow-x-auto gap-2 pb-2">
              {tripDates.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setCheckin(d)}
                  className={`flex-none rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    checkin === d
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container border border-outline-variant text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {d.slice(5)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">Check-out</label>
            <div className="flex overflow-x-auto gap-2 pb-2">
              {tripDates.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setCheckout(d)}
                  className={`flex-none rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    checkout === d
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container border border-outline-variant text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {d.slice(5)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="time" label="Check-in Time" value={checkinTime} onChange={e => setCheckinTime(e.target.value)} />
          <Input type="time" label="Check-out Time" value={checkoutTime} onChange={e => setCheckoutTime(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="number" label="Price" value={price} onChange={e => setPrice(e.target.value)} />
          <Input label="Currency" value={currency} onChange={e => setCurrency(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">Service</label>
            <select
              value={service}
              onChange={e => setService(e.target.value as AccommodationService)}
              className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            >
              {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {service === 'other' && (
            <Input label="Service name" value={serviceOtherLabel} onChange={e => setServiceOtherLabel(e.target.value)} />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Confirmation / Booking ID" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as AccommodationStatus)}
              className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-on-surface">Location / Address</label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            rows={2}
            className="rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-on-surface"
          />
        </div>

        <Input label="Booking URL" value={url} onChange={e => setUrl(e.target.value)} />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-on-surface">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-on-surface"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-on-surface">Attachments</label>
          {attachments.length > 0 && (
            <ul className="text-xs space-y-1">
              {attachments.map(a => <li key={a} className="truncate text-primary">{a}</li>)}
            </ul>
          )}
          <div>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-on-secondary shadow transition-colors hover:bg-secondary/90">
              {uploading ? 'Uploading...' : 'Upload screenshot/PDF'}
              <input type="file" className="hidden" accept="image/*,application/pdf" disabled={uploading} onChange={(e) => void handleFileUpload(e)} />
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting || uploading}>Cancel</Button>}
          <Button type="submit" disabled={submitting || uploading}>
            {submitting ? 'Saving...' : isEdit ? 'Save' : 'Create accommodation'}
          </Button>
        </div>
      </form>
    </div>
  );
}
