import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Button, Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import type { Place } from '@/domain/place';
import maplibregl from 'maplibre-gl';

import { PlaceForm } from './Form';
import { PlacesList } from './List';
import { PlaceDetail } from './Detail';
import { MapLibreMap } from '@/lib/maps/MapLibreMap';
import { placeFilePath } from '../paths';
import { deletePlace } from '../queries';
import { ulid } from 'ulid';


type DialogMode = 'none' | 'form' | 'view';

export function PlacesRoute(): React.JSX.Element {
  const { writeQueue } = useAppServices();
  const { activeTrip, loading } = useActiveTrip();

  const [dialogMode, setDialogMode] = useState<DialogMode>('none');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);


  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedPlaces, setLoadedPlaces] = useState<Place[]>([]);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // When places change, update map markers
  const handleDataLoaded = useCallback((places: Place[]) => {
    setLoadedPlaces(places);
  }, []);

  const openCreate = useCallback(() => {
    setSelectedPlace(null);
    setDialogMode('form'); 
  }, []);

  const openEdit = useCallback((place: Place) => {
    setSelectedPlace(place);

    setDialogMode('form');
  }, []);

  const openView = useCallback((place: Place) => {
    setSelectedPlace(place);
    setDialogMode('view');
    // Pan map to place
    if (mapInstance && place.lat !== undefined && place.lng !== undefined) {
      mapInstance.flyTo({ center: [place.lng, place.lat], zoom: 14 });
    }
  }, [mapInstance]);

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
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Failed to delete place', err);
      alert('Failed to delete place');
    }
  }, [activeTrip, writeQueue]);

  const handleFormSuccess = useCallback(() => {
    setDialogMode('none');
    setSelectedPlace(null);

    setRefreshKey(k => k + 1);
    if (mapInstance) {
      // Don't fly immediately as we might not have lat/lng yet (they are updated async sometimes). 
      // But if we have them, we could. The map will recenter anyway when loadedPlaces changes.
    }
  }, [mapInstance]);

  const handleMapLoad = useCallback((map: maplibregl.Map) => {
    setMapInstance(map);
  }, []);

  const handleMapClick = useCallback(() => {
    // Drop a pin feature requires reverse-geocode to a Place ID in the new architecture.
    setSelectedPlace(null);
    setDialogMode('form');
  }, []);



  // Compute bounding box or center from places
  const placesWithCoords = useMemo(() => loadedPlaces.filter(p => p.lat !== undefined && p.lng !== undefined), [loadedPlaces]);

  const initialCenter = useMemo<[number, number]>(() => {
    if (placesWithCoords.length > 0) {
      return [placesWithCoords[0].lng!, placesWithCoords[0].lat!];
    }
    return [0, 0]; // Default center
  }, [placesWithCoords]);

  // We need to manage markers dynamically using an effect
  const markersRef = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    if (!mapInstance) return;
    
    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add new markers
    loadedPlaces.forEach(place => {
      if (place.lat !== undefined && place.lng !== undefined) {
        const el = document.createElement('div');
        el.className = 'w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ' + (place.visited ? 'bg-primary/80 text-white' : 'bg-red-500 text-white');
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';
        
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          openView(place);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([place.lng, place.lat])
          .addTo(mapInstance);
          
        markersRef.current.push(marker);
      }
    });
  }, [mapInstance, loadedPlaces, openView]);

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
        <MapLibreMap 
          initialCenter={initialCenter}
          initialZoom={placesWithCoords.length > 0 ? 10 : 2}
          onMapLoad={handleMapLoad}
          onClick={handleMapClick}
        >
          {/* We render markers using basic HTML elements over the map, MapLibre manages standard markers via its own API usually,
              but for React it's easier to sync them. However, since MapLibre Map is unmanaged, we could just manually add maplibregl.Marker instances.
              For simplicity, we'll map them visually if possible, or leave it for later enhancement. */}
        </MapLibreMap>
      </div>

      <PlacesList 
        tripId={activeTrip.id} 
        onView={openView}
        onEdit={openEdit} 
        onDelete={handleDelete}
        refreshKey={refreshKey} 
        onDataLoaded={handleDataLoaded}
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
            existingPlaces={loadedPlaces}
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
