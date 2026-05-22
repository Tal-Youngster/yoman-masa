export interface TabDef {
  /** Path under the root. '/' for dashboard, otherwise `/<slug>`. */
  to: '/' | '/trips' | '/accommodations' | '/expenses' | '/places' | '/tasks' | '/shopping' | '/articles';
  label: string;
  /** Compact label for the bottom nav at small widths. */
  shortLabel: string;
  /** Single-glyph icon. Replaced with an SVG icon set in a later polish slice. */
  icon: string;
}

export const TABS: readonly TabDef[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: '⌂' },
  { to: '/trips', label: 'Trips', shortLabel: 'Trips', icon: '✈' },
  { to: '/accommodations', label: 'Accommodations', shortLabel: 'Stay', icon: '⌗' },
  { to: '/expenses', label: 'Expenses', shortLabel: 'Money', icon: '¤' },
  { to: '/places', label: 'Places', shortLabel: 'Map', icon: '◉' },
  { to: '/tasks', label: 'Tasks', shortLabel: 'Tasks', icon: '✓' },
  { to: '/shopping', label: 'Shopping', shortLabel: 'Shop', icon: '⌘' },
  { to: '/articles', label: 'Articles', shortLabel: 'Read', icon: '☰' },
];
