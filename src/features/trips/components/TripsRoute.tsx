import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useValidateTravelFolder } from '@/app/use-validate-travel-folder';
import type { Trip } from '@/domain/trip';

import { FirstRunFolderPrompt } from './FirstRunFolderPrompt';
import { TripForm } from './TripForm';
import { TripsList } from './TripsList';

/**
 * Top-level route for /trips. Decides between:
 *   - first-run folder prompt (kv.travel_folder_file_id is null)
 *   - trips list + create/edit affordances
 */
export function TripsRoute(): React.JSX.Element {
  const { tripsAdmin } = useAppServices();

  // Validates the persisted folder id (see useValidateTravelFolder); the setter
  // lets a fresh pick reveal the list without re-reading.
  const [travelFolderId, setTravelFolderId] = useValidateTravelFolder();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function openCreate(): void {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(trip: Trip): void {
    setEditing(trip);
    setSheetOpen(true);
  }

  async function handleDelete(trip: Trip): Promise<void> {
    if (!tripsAdmin) return;
    await tripsAdmin.deleteTrip(trip.id);
    setRefreshKey((k) => k + 1);
  }



  function handleFormSuccess(): void {
    setSheetOpen(false);
    setEditing(null);
    setRefreshKey((k) => k + 1);
    // Best-effort sync after a mutation. Worker is idempotent if a sync is
    // already in flight (we'd add a lock in a later slice).
    if (tripsAdmin) void tripsAdmin.syncNow();
  }

  if (travelFolderId === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="text-lg font-semibold text-on-surface">Trips</h2>
        </header>
        <p className="text-sm text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  if (travelFolderId === null) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="text-lg font-semibold text-on-surface">Trips</h2>
        </header>
        <FirstRunFolderPrompt
          onPicked={(folder) => {
            setTravelFolderId(folder.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Trips</h2>
          <p className="text-xs text-on-surface-variant">Plan and switch between trips.</p>
        </div>
        <div className="flex items-center gap-1">

          <button
            type="button"
            onClick={openCreate}
            aria-label="New trip"
            title="New trip"
            data-testid="trips-new"
            className="rounded-md p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>



      <TripsList onEdit={openEdit} onDelete={handleDelete} refreshKey={refreshKey} />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        side="bottom"
        title={editing ? `Edit "${editing.name}"` : 'New trip'}
      >
        <TripForm
          key={editing?.id ?? 'new'}
          {...(editing ? { initial: editing } : {})}
          onSuccess={handleFormSuccess}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}
