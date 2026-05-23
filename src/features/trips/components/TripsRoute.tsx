import { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';

import { Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
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
  const { kv, tripsAdmin } = useAppServices();

  const [travelFolderId, setTravelFolderId] = useState<string | null | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const folder = await kv.get('travel_folder_file_id');
      if (cancelled) return;
      setTravelFolderId(folder);
    })();
    return () => {
      cancelled = true;
    };
  }, [kv]);

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

  async function handleSyncNow(): Promise<void> {
    if (!tripsAdmin) return;
    setSyncing(true);
    setSyncMessage(null);
    const report = await tripsAdmin.syncNow();
    setSyncing(false);
    if (!report) {
      setSyncMessage('Sync failed — see console for details.');
      return;
    }
    setSyncMessage(
      `Sync done: ${report.applied} applied, ${report.retried} retried, ${report.deadLettered} dead-lettered.`,
    );
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
            onClick={() => void handleSyncNow()}
            disabled={syncing || !tripsAdmin}
            aria-label="Sync now"
            title={syncing ? 'Syncing…' : 'Sync now'}
            data-testid="trips-sync-now"
            className="rounded-md p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
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

      {syncMessage && (
        <p className="text-xs text-on-surface-variant" data-testid="trips-sync-status">
          {syncMessage}
        </p>
      )}

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
