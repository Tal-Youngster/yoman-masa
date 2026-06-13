import { PLACE_PIN_ACCOMMODATION, PLACE_PIN_VISITED, PLACE_PIN_WISHLIST } from '../colors';

const ITEMS: { color: string; label: string }[] = [
  { color: PLACE_PIN_WISHLIST, label: 'Wishlist' },
  { color: PLACE_PIN_VISITED, label: 'Visited' },
  { color: PLACE_PIN_ACCOMMODATION, label: 'Stays' },
];

/** Compact key for the Trip Map pin colours. */
export function MapLegend(): React.JSX.Element {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-on-surface-variant">
      {ITEMS.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
            style={{ backgroundColor: it.color }}
            aria-hidden
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
