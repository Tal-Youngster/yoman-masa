export type DisplayStatus = 'planned' | 'active' | 'completed';

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  planned: 'In Planning',
  active: 'Active',
  completed: 'Completed',
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Derive a trip's display status from its date range. ISO `YYYY-MM-DD`
 * strings compare lexically, so the branded `IsoDate` and plain strings
 * both work as inputs.
 */
export function getDisplayStatus(
  trip: { start_date: string; end_date: string },
  today: string = todayIso(),
): DisplayStatus {
  if (today < trip.start_date) return 'planned';
  if (today > trip.end_date) return 'completed';
  return 'active';
}
