import { useState, useEffect } from 'react';
import { Place } from '@/domain/place';
import { Star, MapPin } from 'lucide-react';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

export interface PlaceDetailProps {
  place: Place;
}

export function PlaceDetail({ place }: PlaceDetailProps): React.JSX.Element {
  const [enrichedDetails, setEnrichedDetails] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchPlaceDetails() {
      if (!GOOGLE_API_KEY || !place.place_id) return;
      setIsLoading(true);
      try {
        const res = await fetch(`https://places.googleapis.com/v1/places/${place.place_id}`, {
          headers: {
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,photos'
          }
        });
        if (res.ok) {
          setEnrichedDetails(await res.json());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchPlaceDetails();
  }, [place.place_id]);

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Async Preview Card */}
      <div className="bg-surface-container rounded-xl overflow-hidden shadow border border-outline-variant flex flex-col w-full min-h-[200px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full p-6 text-sm text-on-surface-variant animate-pulse">
            Fetching location details...
          </div>
        ) : enrichedDetails ? (
          <>
            <div className="h-48 bg-surface-container-highest relative">
              {enrichedDetails.photos && enrichedDetails.photos.length > 0 ? (
                <img 
                  src={`https://places.googleapis.com/v1/${enrichedDetails.photos[0].name}/media?maxHeightPx=400&maxWidthPx=800&key=${GOOGLE_API_KEY}`}
                  alt="Location"
                  className="w-full h-full object-cover"
                />
              ) : enrichedDetails.location ? (
                <img 
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${enrichedDetails.location.latitude},${enrichedDetails.location.longitude}&zoom=15&size=800x300&markers=color:red%7C${enrichedDetails.location.latitude},${enrichedDetails.location.longitude}&key=${GOOGLE_API_KEY}`}
                  alt="Map"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full p-6 text-xs text-on-surface-variant">No preview available</div>
              )}
            </div>
            
            <div className="p-4 flex flex-col gap-3">
              <div>
                <h3 className="font-semibold text-on-surface">{enrichedDetails.displayName?.text || place.place_alias || 'Unknown Location'}</h3>
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
        ) : (
           <div className="p-6 text-sm text-on-surface-variant">Could not load preview.</div>
        )}
      </div>

      <div className="flex flex-col gap-4 px-1">
        {place.category && (
          <div>
            <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Category</h3>
            <p className="text-sm text-on-surface mt-1">{place.category}</p>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Status</h3>
          <p className="text-sm text-on-surface mt-1">
            {place.visited ? 'Visited' : 'Wishlist'}
          </p>
        </div>

        {place.notes && (
          <div>
            <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Notes</h3>
            <div className="text-sm text-on-surface mt-1 whitespace-pre-wrap">{place.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
