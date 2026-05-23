import { useEffect, useState } from 'react';

import { Button, Sheet } from '@/ui/components';
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
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [folder, active] = await Promise.all([
        kv.get('travel_folder_file_id'),
        kv.get('active_trip_id'),
      ]);
      if (cancelled) return;
      setTravelFolderId(folder);
      setActiveTripId(active);
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

  async function handleSetActive(tripId: string): Promise<void> {
    if (!tripsAdmin) return;
    await tripsAdmin.setActiveTrip(tripId);
    setActiveTripId(tripId);
    setSyncMessage(null);
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
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleSyncNow()}
            disabled={syncing || !tripsAdmin}
            data-testid="trips-sync-now"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button onClick={openCreate} data-testid="trips-new">
            New trip
          </Button>
        </div>
      </div>

      {syncMessage && (
        <p className="text-xs text-on-surface-variant" data-testid="trips-sync-status">
          {syncMessage}
        </p>
      )}

      <TripsList
        activeTripId={activeTripId}
        onSetActive={handleSetActive}
        onEdit={openEdit}
        refreshKey={refreshKey}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        side="bottom"
        title={editing ? `Edit "${editing.name}"` : 'New trip'}
      >
        <TripForm
          {...(editing ? { initial: editing } : {})}
          onSuccess={handleFormSuccess}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}
