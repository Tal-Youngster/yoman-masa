import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import type { Accommodation } from '@/domain/accommodation';

import { AccommodationForm } from './AccommodationForm';
import { AccommodationsList } from './AccommodationsList';
import { AccommodationView } from './AccommodationView';
import { MissingNightsView } from '@/features/missing-nights/components';
import { TripCalendar } from './TripCalendar';
import { AiExtractionDialog } from './AiExtractionDialog';
import type { AiExtractedData } from './AiExtractionDialog';
import { ulid } from 'ulid';
import { accommodationFilePath } from '../paths';
import { deleteAccommodation, listAccommodationsByTrip } from '../queries';

type DialogMode = 'none' | 'extraction' | 'form' | 'view';

export function AccommodationsRoute(): React.JSX.Element {
  const { writeQueue } = useAppServices();
  const { activeTrip, loading } = useActiveTrip();

  const [dialogMode, setDialogMode] = useState<DialogMode>('none');
  const [aiData, setAiData] = useState<AiExtractedData | undefined>(undefined);
  const [aiSource, setAiSource] = useState<{ url?: string; file?: File } | undefined>(undefined);
  const [selectedAcc, setSelectedAcc] = useState<Accommodation | null>(null);

  // Shared with MissingNightsView and TripCalendar. Dexie-subscribed so any
  // write (local or inbound pull) flows through without manual invalidation.
  const accommodations = useLiveQuery(
    () => (activeTrip ? listAccommodationsByTrip(activeTrip.id) : Promise.resolve([])),
    [activeTrip?.id],
  ) ?? [];

  function openCreate(): void {
    setSelectedAcc(null);
    setAiData(undefined);
    setAiSource(undefined);
    setDialogMode('extraction');
  }

  function openEdit(acc: Accommodation): void {
    setSelectedAcc(acc);
    setAiData(undefined);
    setAiSource(undefined);
    setDialogMode('form');
  }

  function openView(acc: Accommodation): void {
    setSelectedAcc(acc);
    setDialogMode('view');
  }

  async function handleDelete(acc: Accommodation) {
    if (!activeTrip) return;
    try {
      await deleteAccommodation(acc.id);
      
      const path = accommodationFilePath('Travel', activeTrip.slug, acc.checkin, acc.name);
      if (writeQueue) {
        await writeQueue.enqueue({
          id: ulid(),
          entityType: 'accommodation',
          entityId: acc.id,
          op: 'delete',
          payload: { accommodation: acc },
          baseRevision: null,
          fileId: null,
          resolvedPath: path,
          attempts: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        });
      }
      
      setDialogMode('none');
      setSelectedAcc(null);
      // useLiveQuery re-renders on the Dexie delete; no manual bump needed.
    } catch (err) {
      console.error('Failed to delete accommodation', err);
      alert('Failed to delete accommodation');
    }
  }

  function handleFormSuccess(): void {
    setDialogMode('none');
    setSelectedAcc(null);
    setAiData(undefined);
    setAiSource(undefined);
  }

  function handleExtracted(data: AiExtractedData, source?: { url?: string; file?: File }) {
    setAiData(data);
    setAiSource(source);
    setDialogMode('form');
  }

  function handleManualEntry() {
    setAiData(undefined);
    setAiSource(undefined);
    setDialogMode('form');
  }

  if (loading) {
    return <p className="text-sm text-on-surface-variant">Loading...</p>;
  }

  if (!activeTrip) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="text-lg font-semibold text-on-surface">Accommodations</h2>
        </header>
        <p className="text-sm text-on-surface-variant">Please set an active trip first in the Trips tab.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Accommodations</h2>
          <p className="text-xs text-on-surface-variant">Manage your stays for {activeTrip.name}.</p>
        </div>
        <div>
          <Button onClick={openCreate} aria-label="New accommodation">+</Button>
        </div>
      </div>

      <MissingNightsView trip={activeTrip} accommodations={accommodations} />

      <TripCalendar
        trip={activeTrip}
        accommodations={accommodations}
        onAccommodationClick={openView}
        onMissingClick={() => openCreate()}
      />

      <AccommodationsList
        tripId={activeTrip.id}
        onView={openView}
        onEdit={openEdit}
      />

      <Sheet
        open={dialogMode !== 'none'}
        onClose={() => setDialogMode('none')}
        side="bottom"
        title={
          dialogMode === 'extraction' 
            ? 'Magic Autofill' 
            : dialogMode === 'view' && selectedAcc
              ? selectedAcc.name
              : selectedAcc && dialogMode === 'form'
                ? `Edit "${selectedAcc.name}"` 
                : 'New accommodation'
        }
        headerActions={
          dialogMode === 'view' && selectedAcc ? (
            <>
              <button
                type="button"
                onClick={() => setDialogMode('form')}
                title="Edit"
                className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this accommodation?')) {
                    void handleDelete(selectedAcc);
                  }
                }}
                title="Delete"
                className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </>
          ) : undefined
        }
      >
        {dialogMode === 'extraction' && (
          <AiExtractionDialog 
            onExtracted={handleExtracted}
            onManualEntry={handleManualEntry}
          />
        )}
        
        {dialogMode === 'form' && (
          <AccommodationForm
            trip={activeTrip}
            {...(aiData ? { aiData } : {})}
            {...(aiSource ? { aiSource } : {})}
            {...(selectedAcc ? { initial: selectedAcc } : {})}
            onSuccess={handleFormSuccess}
            onCancel={() => setDialogMode('none')}
          />
        )}
        
        {dialogMode === 'view' && selectedAcc && (
          <AccommodationView
            accommodation={selectedAcc}
          />
        )}
      </Sheet>
    </div>
  );
}
