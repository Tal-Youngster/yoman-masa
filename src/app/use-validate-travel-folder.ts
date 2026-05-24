import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { asFileId, DriveApiError } from '@/sync/drive';

import { useAppServices } from './use-app-services';

/** `undefined` = still validating, `null` = no folder (show picker), string = a valid folder id. */
export type TravelFolderState = string | null | undefined;

/**
 * Read the persisted `travel_folder_file_id` and validate it against Drive once
 * on mount.
 *
 * A persisted folder id can be stale — most painfully, a FakeDrive id (e.g.
 * `fld-000002`) left in Dexie from running without Google credentials. Once
 * real credentials are configured, every sync sends that id to Drive, 404s, and
 * the write queue retries it on a 1.5s loop forever (see SyncStatus). Detect it
 * here: on a definitive 404, drop the id so the first-run picker takes over.
 *
 * Transient failures (offline, auth churn) must NOT discard a good folder, so we
 * only act on a 404. When no Drive client is wired (the shell can render without
 * one) we skip validation and trust the stored value.
 *
 * Used both at the shell level — so a stale id is healed on any route, not just
 * `/trips` — and by `TripsRoute`, which consumes the returned state to gate
 * between the picker and the trips list. The setter lets the picker reveal the
 * list without waiting for a re-read.
 */
export function useValidateTravelFolder(): [
  TravelFolderState,
  Dispatch<SetStateAction<TravelFolderState>>,
] {
  const { kv, drive } = useAppServices();
  const [travelFolderId, setTravelFolderId] = useState<TravelFolderState>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const folder = await kv.get('travel_folder_file_id');
      if (cancelled) return;
      if (folder && drive) {
        try {
          await drive.getMetadata(asFileId(folder));
        } catch (err) {
          if (err instanceof DriveApiError && err.status === 404) {
            await kv.set('travel_folder_file_id', null);
            if (!cancelled) setTravelFolderId(null);
            return;
          }
        }
      }
      if (!cancelled) setTravelFolderId(folder);
    })();
    return () => {
      cancelled = true;
    };
  }, [kv, drive]);

  return [travelFolderId, setTravelFolderId];
}
