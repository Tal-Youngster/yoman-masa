/**
 * Pin / path colour constants shared between PlacesMap (S8b) and the Path map
 * route (S9). Kept in the places slice because that's where the original visited
 * / wishlist palette is defined; the path-map slice imports them so the two
 * surfaces can't drift out of sync.
 */
export const PLACE_PIN_VISITED = '#1f8a4c';
export const PLACE_PIN_WISHLIST = '#e0413e';

/** Stroke for the path-map polyline (ADR-0015). Reused as the accommodation
 *  pin colour so a lodging on the route reads as "on the line". */
export const PATH_STROKE_COLOR = '#2563eb';
export const PATH_PIN_ACCOMMODATION = PATH_STROKE_COLOR;
