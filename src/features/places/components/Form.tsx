import { useState, useId, useEffect } from 'react';
import { Button, Input } from '@/ui/components';
import { Place, newPlace } from '@/domain/place';
import type { Trip } from '@/domain/trip';
import { useAppServices } from '@/app/use-app-services';
import { upsertPlace } from '../queries';
import { placeFilePath } from '../paths';
import { parseGoogleMapsUrl } from '../google-maps-link';
import { ulid } from 'ulid';
import { Star, MapPin, Link2 } from 'lucide-react';

export interface PlaceFormProps {
  trip: Trip;
  existingPlaces: Place[];
  initial?: Place;
  onSuccess?: (place: Place) => void;
  onCancel?: () => void;
}

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

export function PlaceForm({ trip, existingPlaces, initial, onSuccess, onCancel }: PlaceFormProps): React.JSX.Element {
  const { writeQueue } = useAppServices();
  const formId = useId();

  const [searchQuery, setSearchQuery] = useState('');
  interface SearchSuggestion {
    placePrediction: {
      placeId: string;
      text: { text: string };
      structuredFormat?: {
        mainText?: { text: string };
        secondaryText?: { text: string };
      };
    };
  }
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [linkInput, setLinkInput] = useState('');
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [placeId, setPlaceId] = useState(initial?.place_id ?? '');
  const [placeAlias, setPlaceAlias] = useState(initial?.place_alias ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'restaurants');
  const [visited, setVisited] = useState<boolean>(initial?.visited ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Enrichment state
  interface EnrichedDetails {
    location?: { latitude: number; longitude: number };
    photos?: { name: string }[];
    displayName?: { text: string };
    formattedAddress?: string;
    rating?: number;
  }
  const [enrichedDetails, setEnrichedDetails] = useState<EnrichedDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const isEdit = initial !== undefined;

  // On mount or when initial place_id is available, fetch details
  useEffect(() => {
    if (placeId) {
      void fetchPlaceDetails(placeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  async function fetchPlaceDetails(id: string): Promise<EnrichedDetails | null> {
    if (!GOOGLE_API_KEY) return null;
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
        headers: {
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,photos'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const data = await res.json() as EnrichedDetails;
      setEnrichedDetails(data);
      return data;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setIsLoadingDetails(false);
    }
  }

  /** Resolve a pasted Google Maps URL to a Google place_id, then enrich it like a search pick. */
  async function resolveGoogleMapsLink(value: string) {
    setLinkError(null);
    const parsed = parseGoogleMapsUrl(value);
    if (!parsed) {
      setLinkError("Couldn't read that as a Google Maps link or coordinates.");
      return;
    }
    if (parsed.shortened) {
      setLinkError(
        'Shortened links (maps.app.goo.gl) can’t be opened here. Open the link, then copy the full URL from the address bar — or use search above.',
      );
      return;
    }

    // Best case: the link carried a real Places id (api=1 share links).
    if (parsed.placeId) {
      applyResolvedPlaceId(parsed.placeId, parsed.name);
      return;
    }

    // Otherwise resolve the coordinates/name to a canonical Google place via Text Search.
    if (!GOOGLE_API_KEY) {
      setLinkError('Google API key missing.');
      return;
    }
    const textQuery = parsed.name ?? (parsed.lat !== undefined ? `${parsed.lat},${parsed.lng}` : '');
    if (!textQuery) {
      setLinkError('That link had no usable place or coordinates.');
      return;
    }

    setIsResolvingLink(true);
    try {
      const body: Record<string, unknown> = { textQuery, maxResultCount: 1 };
      if (parsed.lat !== undefined && parsed.lng !== undefined) {
        body.locationBias = {
          circle: { center: { latitude: parsed.lat, longitude: parsed.lng }, radius: 500 },
        };
      }
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName',
        },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        throw new Error('403 Forbidden. Enable "Places API (New)" for this key.');
      }
      if (!res.ok) throw new Error('Lookup failed.');
      const data = (await res.json()) as { places?: { id: string; displayName?: { text: string } }[] };
      const top = data.places?.[0];
      if (!top) {
        setLinkError('No matching place found for that link. Try searching by name instead.');
        return;
      }
      applyResolvedPlaceId(top.id, parsed.name ?? top.displayName?.text);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsResolvingLink(false);
    }
  }

  function applyResolvedPlaceId(id: string, name?: string) {
    if (!isEdit && existingPlaces.some((p) => p.place_id === id)) {
      setLinkError('This place is already in your list!');
      return;
    }
    setPlaceId(id); // triggers the details fetch effect
    if (name && !placeAlias) setPlaceAlias(name);
    setLinkInput('');
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!placeId.trim()) return setError('Please select a valid place from the map search.');

    setSubmitting(true);
    setError(null);
    try {
      // A place is useless on the map without coordinates. If the async enrichment
      // hasn't landed yet (e.g. user submitted immediately after pasting a link),
      // fetch details synchronously so we never persist a coordinate-less place.
      let details = enrichedDetails;
      if (details?.location === undefined && GOOGLE_API_KEY) {
        details = await fetchPlaceDetails(placeId.trim());
      }

      const placeData = {
        trip_id: trip.id,
        place_id: placeId.trim(),
        place_alias: placeAlias.trim() || undefined,
        category: category.trim() || undefined,
        lat: details?.location?.latitude ?? initial?.lat,
        lng: details?.location?.longitude ?? initial?.lng,
        visited,
        notes: notes.trim(),
      };

      let place: Place;
      let op: 'create' | 'update';

      if (isEdit && initial) {
        place = Place.parse({ ...initial, ...placeData });
        op = 'update';
      } else {
        place = newPlace(placeData);
        op = 'create';
      }

      await upsertPlace(place);

      // Using the alias or fallback
      const fileName = place.place_alias || place.place_id;
      const path = placeFilePath('Travel', trip.slug, fileName);

      if (!writeQueue) throw new Error('Write queue not configured');

      await writeQueue.enqueue({
        id: ulid(),
        entityType: 'place',
        entityId: place.id,
        op,
        payload: { place },
        baseRevision: null,
        fileId: null,
        resolvedPath: path,
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
      });

      onSuccess?.(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void executeSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  async function executeSearch(query: string) {
    if (!GOOGLE_API_KEY) {
      setSearchError('Google API key missing.');
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places:autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
        },
        body: JSON.stringify({ input: query })
      });
      if (res.status === 403) {
        throw new Error('403 Forbidden. Please make sure "Places API (New)" is enabled in your Google Cloud Console for this API Key.');
      }
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json() as { suggestions?: SearchSuggestion[] };
      setSearchResults(data.suggestions || []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  }

  function applySearchResult(suggestion: SearchSuggestion) {
    const selectedPlaceId = suggestion.placePrediction.placeId;
    const selectedName = suggestion.placePrediction.text.text;
    
    if (!isEdit && existingPlaces.some(p => p.place_id === selectedPlaceId)) {
      setSearchError('This place is already in your list!');
      return;
    }
    
    setPlaceId(selectedPlaceId);
    if (!placeAlias) {
      setPlaceAlias(selectedName);
    }
    setSearchQuery('');
    setSearchResults([]);
    
    void fetchPlaceDetails(selectedPlaceId);
  }

  return (
    <div className="flex flex-col gap-6 pb-8 pt-2">
      <div className="flex-1 flex flex-col gap-4">
        {!isEdit && (
          <div className="flex flex-col gap-2 relative">
            <Input 
              label="Search Google Maps"
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              placeholder="e.g. The Coffee House, Palermo" 
              autoFocus
            />
            {isSearching && <span className="absolute right-3 top-9 text-xs text-on-surface-variant">Searching...</span>}
            {searchError && <p className="text-xs text-red-400">{searchError}</p>}
            
            {searchResults.length > 0 && (
              <ul className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface-container-highest border border-outline-variant rounded-lg shadow-xl max-h-60 overflow-y-auto flex flex-col">
                {searchResults.map(r => (
                  <li key={r.placePrediction.placeId} className="border-b border-outline-variant last:border-0">
                    <button 
                      type="button"
                      onClick={() => applySearchResult(r)}
                      className="text-left w-full p-3 hover:bg-surface-container-lowest transition-colors flex flex-col"
                    >
                      <span className="font-medium text-sm text-on-surface">{r.placePrediction.structuredFormat?.mainText?.text || r.placePrediction.text.text}</span>
                      <span className="text-xs text-on-surface-variant truncate">{r.placePrediction.structuredFormat?.secondaryText?.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!isEdit && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">Or paste a Google Maps link</label>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  value={linkInput}
                  onChange={(e) => { setLinkInput(e.target.value); setLinkError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void resolveGoogleMapsLink(linkInput); }
                  }}
                  placeholder="maps.app… URL, /maps/place… URL, or lat,lng"
                />
              </div>
              <Button
                type="button"
                onClick={() => void resolveGoogleMapsLink(linkInput)}
                disabled={isResolvingLink || !linkInput.trim()}
                className="h-10 shrink-0"
              >
                <Link2 className="w-4 h-4" />
                {isResolvingLink ? 'Adding…' : 'Add'}
              </Button>
            </div>
            {linkError && <p className="text-xs text-red-400">{linkError}</p>}
            {placeId && !linkError && (
              <p className="text-xs text-green-500">Place added — review the details below and save.</p>
            )}
          </div>
        )}

        <form id={formId} onSubmit={(ev) => void handleSubmit(ev)} className="flex flex-col gap-3">
          <Input label="Place Alias (Optional)" value={placeAlias} onChange={e => setPlaceAlias(e.target.value)} placeholder="e.g. Best Croissants in Buenos Aires" />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">Category</label>
            <select 
              value={category} 
              onChange={e => setCategory(e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest p-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
            >
              <option value="restaurants">Restaurants</option>
              <option value="coffee">Coffee</option>
              <option value="attractions">Attractions</option>
              <option value="">Other</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <label className="text-xs font-medium text-on-surface">Status</label>
            <div className="flex bg-surface-container-highest p-1 rounded-lg w-max">
              <button
                type="button"
                onClick={() => setVisited(false)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${!visited ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Wishlist
              </button>
              <button
                type="button"
                onClick={() => setVisited(true)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${visited ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Visited
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Any specific tips or things to order..."
              className="rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 mt-4">
            {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Place'}
            </Button>
          </div>
        </form>
      </div>

      {/* Async Preview Card */}
      {(isLoadingDetails || enrichedDetails) && (
        <div className="w-full flex-shrink-0 flex flex-col gap-2">
          <label className="text-xs font-medium text-on-surface-variant">Location Preview</label>
          <div className="bg-surface-container rounded-xl overflow-hidden shadow border border-outline-variant flex flex-col h-full min-h-[300px]">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center h-full p-6 text-sm text-on-surface-variant animate-pulse">
                Fetching location details...
              </div>
            ) : enrichedDetails ? (
              <>
                {/* Map/Photo Header */}
                <div className="h-40 bg-surface-container-highest relative">
                  {enrichedDetails.photos && enrichedDetails.photos.length > 0 ? (
                    <img 
                      src={`https://places.googleapis.com/v1/${enrichedDetails.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_API_KEY}`}
                      alt="Location"
                      className="w-full h-full object-cover"
                    />
                  ) : enrichedDetails.location ? (
                    <img 
                      src={`https://maps.googleapis.com/maps/api/staticmap?center=${enrichedDetails.location.latitude},${enrichedDetails.location.longitude}&zoom=15&size=400x200&markers=color:red%7C${enrichedDetails.location.latitude},${enrichedDetails.location.longitude}&key=${GOOGLE_API_KEY}`}
                      alt="Map"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-on-surface-variant">No preview available</div>
                  )}
                </div>
                
                {/* Details Body */}
                <div className="p-4 flex flex-col gap-3">
                  <div>
                    <h3 className="font-semibold text-on-surface">{enrichedDetails.displayName?.text || 'Unknown Location'}</h3>
                    <p className="text-xs text-on-surface-variant flex items-start gap-1 mt-1">
                      <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{enrichedDetails.formattedAddress}</span>
                    </p>
                  </div>
                  
                  {enrichedDetails.rating && (
                    <div className="flex items-center gap-1 mt-auto">
                      <span className="font-medium text-sm text-on-surface">{enrichedDetails.rating}</span>
                      <div className="flex items-center text-yellow-500">
                        <Star className="w-4 h-4 fill-current" />
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
