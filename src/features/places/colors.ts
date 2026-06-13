/**
 * Pin colour constants for the Trip Map. Kept in the places slice because
 * that's where the visited / wishlist palette originates; the Overview map
 * preview imports them so the two surfaces can't drift out of sync.
 */
export const PLACE_PIN_VISITED = '#1f8a4c';
export const PLACE_PIN_WISHLIST = '#e0413e';

/** Accommodations read as "stays" on the map — distinct blue from the places. */
export const PLACE_PIN_ACCOMMODATION = '#2563eb';
