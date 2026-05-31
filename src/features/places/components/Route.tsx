import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import type { Place } from '@/domain/place';

import { PlaceForm } from './Form';
import { PlacesList } from './List';
import { PlaceDetail } from './Detail';
import { PlacesMap } from './PlacesMap';
import { placeFilePath } from '../paths';
import { deletePlace, placesByTrip } from '../queries';
import { ulid } from 'ulid';


type DialogMode = 'none' | 'form' | 'view';

export function PlacesRoute(): React.JSX.Element {
  const { writeQueue } = useAppServices();
  const { activeTrip, loading } = useActiveTrip();

  const [dialogMode, setDialogMode] = useState<DialogMode>('none');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  // Shared with PlacesMap and PlaceForm. Dexie-subscribed so any write — local
  // or inbound from Drive — flows through without manual invalidation.
  const places = useLiveQuery(
    () => (activeTrip ? placesByTrip(activeTrip.id) : Promise.resolve([])),
    [activeTrip?.id],
  ) ?? [];

  const openCreate = useCallback(() => {
    setSelectedPlace(null);
    setDialogMode('form');
  }, []);

  const openEdit = useCallback((place: Place) => {
    setSelectedPlace(place);

    setDialogMode('form');
  }, []);

  // Selecting a place pans the map via PlacesMap's controller (driven by `selectedPlace`).
  const openView = useCallback((place: Place) => {
    setSelectedPlace(place);
    setDialogMode('view');
  }, []);

  const handleDelete = useCallback(async (place: Place) => {
    if (!activeTrip) return;
    try {
      await deletePlace(place.id);
      
      const fileName = place.place_alias || place.place_id;
      const path = placeFilePath('Travel', activeTrip.slug, fileName);
      if (writeQueue) {
        await writeQueue.enqueue({
          id: ulid(),
          entityType: 'place',
          entityId: place.id,
          op: 'delete',
          payload: { place },
          baseRevision: null,
          fileId: null,
          resolvedPath: path,
          attempts: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        });
      }
      
      setDialogMode('none');
      setSelectedPlace(null);
      // useLiveQuery re-renders on the Dexie delete; no manual bump needed.
    } catch (err) {
      console.error('Failed to delete place', err);
      alert('Failed to delete place');
    }
  }, [activeTrip, writeQueue]);

  const handleFormSuccess = useCallback(() => {
    setDialogMode('none');
    setSelectedPlace(null);
  }, []);

  const handleMapClick = useCallback(() => {
    setSelectedPlace(null);
    setDialogMode('form');
  }, []);

  if (loading) {
    return <p className="text-sm text-on-surface-variant">Loading...</p>;
  }

  if (!activeTrip) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="text-lg font-semibold text-on-surface">Places</h2>
        </header>
        <p className="text-sm text-on-surface-variant">Please set an active trip first in the Trips tab.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Places</h2>
          <p className="text-xs text-on-surface-variant">Manage your wishlist and visited spots for {activeTrip.name}.</p>
        </div>
        <div>
          <Button onClick={openCreate} aria-label="New place">+</Button>
        </div>
      </div>

      <div className="h-64 sm:h-96 w-full rounded-xl overflow-hidden border border-outline-variant shadow-sm relative">
        <PlacesMap
          places={places}
          selected={selectedPlace}
          onMarkerClick={openView}
          onMapClick={handleMapClick}
        />
      </div>

      <PlacesList
        tripId={activeTrip.id}
        onView={openView}
        onEdit={openEdit}
        onDelete={(p) => { void handleDelete(p); }}
      />

      <Sheet
        open={dialogMode !== 'none'}
        onClose={() => setDialogMode('none')}
        side="bottom"
        title={
            dialogMode === 'view' && selectedPlace
              ? selectedPlace.place_alias || 'Unnamed place'
              : selectedPlace && dialogMode === 'form'
                ? `Edit "${selectedPlace.place_alias || selectedPlace.place_id}"` 
                : 'New place'
        }
        headerActions={
          dialogMode === 'view' && selectedPlace ? (
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
                  if (confirm('Are you sure you want to delete this place?')) {
                    void handleDelete(selectedPlace);
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


        {dialogMode === 'form' && (
          <PlaceForm
            trip={activeTrip}
            existingPlaces={places}
            {...(selectedPlace ? { initial: selectedPlace } : {})}

            onSuccess={handleFormSuccess}
            onCancel={() => setDialogMode('none')}
          />
        )}
        
        {dialogMode === 'view' && selectedPlace && (
          <PlaceDetail place={selectedPlace} />
        )}
      </Sheet>
    </div>
  );
}
