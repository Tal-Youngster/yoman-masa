export interface TabDef {
  /** Path under the root. '/' for dashboard, otherwise `/<slug>`. */
  to:
    | '/'
    | '/trips'
    | '/accommodations'
    | '/expenses'
    | '/places'
    | '/tasks'
    | '/shopping'
    | '/articles';
  label: string;
  /** Compact label for the bottom nav at small widths. */
  shortLabel: string;
  /** Single-glyph icon. Replaced with an SVG icon set in a later polish slice. */
  icon: string;
}

export const TABS: readonly TabDef[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'dashboard' },
  { to: '/trips', label: 'Trips', shortLabel: 'Trips', icon: 'trips' },
  { to: '/accommodations', label: 'Accommodations', shortLabel: 'Stay', icon: 'accommodations' },
  { to: '/expenses', label: 'Expenses', shortLabel: 'Money', icon: 'expenses' },
  { to: '/places', label: 'Places', shortLabel: 'Map', icon: 'places' },
  { to: '/tasks', label: 'Tasks', shortLabel: 'Tasks', icon: 'tasks' },
  { to: '/shopping', label: 'Shopping', shortLabel: 'Shop', icon: 'shopping' },
  { to: '/articles', label: 'Articles', shortLabel: 'Read', icon: 'articles' },
];
