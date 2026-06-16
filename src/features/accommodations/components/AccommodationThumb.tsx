import { MapPin, MapPinOff } from 'lucide-react';
import type { Accommodation } from '@/domain/accommodation';
import { PLACE_PIN_ACCOMMODATION } from '@/features/places/colors';
import { staticMapUrl } from '@/lib/maps/static-map';

/**
 * Small location preview shown at the left of an accommodation row. Uses a
 * Static Maps image when a location + API key are available; falls back to a
 * pin glyph (location known, map unavailable) or a struck-through pin (no
 * location set).
 */
export function AccommodationThumb({ acc }: { acc: Accommodation }): React.JSX.Element {
  const loc = acc.location;
  const url = loc
    ? staticMapUrl({
        width: 96,
        height: 96,
        scale: 2,
        center: { lat: loc.lat, lng: loc.lng },
        zoom: 13,
        markers: [{ lat: loc.lat, lng: loc.lng, color: PLACE_PIN_ACCOMMODATION }],
      })
    : null;

  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low">
      {url ? (
        <img
          src={url}
          alt={loc ? `Map showing ${loc.address}` : ''}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
          {loc ? <MapPin className="h-5 w-5" aria-hidden /> : <MapPinOff className="h-5 w-5" aria-hidden />}
        </div>
      )}
    </div>
  );
}
