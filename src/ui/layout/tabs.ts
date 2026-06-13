export interface TabDef {
  /** Path under the root. '/' for the trip overview, otherwise `/<slug>`. */
  to:
    | '/'
    | '/accommodations'
    | '/expenses'
    | '/places'
    | '/tasks'
    | '/shopping'
    | '/articles';
  label: string;
  /** Compact label for the bottom nav at small widths. */
  shortLabel: string;
  /** Icon key resolved by `TabIcon` in SideNav. */
  icon: string;
}

/**
 * The master tab. Switching trips lives here; it is visually separated from the
 * per-trip tabs (it changes the *context* every other tab is scoped to) and is
 * not part of the reorderable set in `TABS`.
 */
export const TRIPS_TAB = {
  to: '/trips',
  label: 'Trips',
  shortLabel: 'Trips',
  icon: 'trips',
} as const;

/**
 * The per-trip tabs — everything scoped to the active trip. Order here is the
 * default; the user can reorder + pin via the More sheet (persisted in navStore).
 */
export const TABS: readonly TabDef[] = [
  { to: '/', label: 'Trip Overview', shortLabel: 'Overview', icon: 'dashboard' },
  { to: '/places', label: 'Trip Map', shortLabel: 'Map', icon: 'places' },
  { to: '/accommodations', label: 'Accommodations', shortLabel: 'Stay', icon: 'accommodations' },
  { to: '/expenses', label: 'Expenses', shortLabel: 'Money', icon: 'expenses' },
  { to: '/tasks', label: 'Tasks', shortLabel: 'Tasks', icon: 'tasks' },
  { to: '/shopping', label: 'Shopping', shortLabel: 'Shop', icon: 'shopping' },
  { to: '/articles', label: 'Articles', shortLabel: 'Read', icon: 'articles' },
];
