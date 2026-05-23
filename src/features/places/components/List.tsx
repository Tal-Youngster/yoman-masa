import { useEffect, useState } from 'react';
import { Card } from '@/ui/components';
import { Pencil, Trash2 } from 'lucide-react';
import { Place } from '@/domain/place';
import type { TripId } from '@/domain/ids';
import { placesByTrip } from '../queries';

export interface PlacesListProps {
  tripId: TripId;
  refreshKey?: number;
  onView: (place: Place) => void;
  onEdit: (place: Place) => void;
  onDelete: (place: Place) => void;
  onDataLoaded?: (places: Place[]) => void;
}

export function PlacesList({ tripId, refreshKey = 0, onView, onEdit, onDelete, onDataLoaded }: PlacesListProps): React.JSX.Element {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void placesByTrip(tripId).then(data => {
      if (!mounted) return;
      // Sort: by name
      const sorted = data.sort((a, b) => {
        return (a.place_alias || a.place_id).localeCompare(b.place_alias || b.place_id);
      });
      setPlaces(sorted);
      setLoading(false);
      onDataLoaded?.(sorted);
    });
    return () => { mounted = false; };
  }, [tripId, refreshKey, onDataLoaded]);

  if (loading) {
    return <div className="text-sm text-on-surface-variant">Loading places...</div>;
  }

  if (places.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant p-8 text-center">
        <p className="text-sm text-on-surface-variant">No places found. Add one to your wishlist!</p>
      </div>
    );
  }

  const wishlist = places.filter(p => !p.visited);
  const visited = places.filter(p => p.visited);

  return (
    <div className="flex flex-col gap-6">
      {wishlist.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">Wishlist ({wishlist.length})</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {wishlist.map(place => (
              <PlaceCard key={place.id} place={place} onView={onView} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}

      {visited.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">Visited ({visited.length})</h3>
          <div className="grid gap-3 sm:grid-cols-2 opacity-80">
            {visited.map(place => (
              <PlaceCard key={place.id} place={place} onView={onView} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PlaceCard({ place, onView, onEdit, onDelete }: { place: Place, onView: (p: Place) => void, onEdit: (p: Place) => void, onDelete: (p: Place) => void }) {
  return (
    <Card 
      onClick={() => onView(place)}
      className="flex flex-col items-start text-left gap-1 hover:border-outline p-3 transition-colors cursor-pointer"
    >
      <div className="flex w-full justify-between items-start gap-2">
        <h4 className="font-medium text-on-surface line-clamp-1">{place.place_alias || place.place_id}</h4>
        <div className="flex items-center gap-1 shrink-0 -mr-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(place); }}
            className="text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface p-1.5 rounded transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              if (confirm('Are you sure you want to delete this place?')) onDelete(place);
            }}
            className="text-on-surface-variant hover:bg-red-500/10 hover:text-red-500 p-1.5 rounded transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-on-surface-variant">
        {place.category && <span>{place.category}</span>}
      </div>
    </Card>
  );
}
