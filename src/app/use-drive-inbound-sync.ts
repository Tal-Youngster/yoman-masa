/**
 * Runs `pullDriveInbound` on the inbound triggers ADR-0014 lists:
 *  - mount (app start, after the Travel folder is configured)
 *  - `window` focus (user returns to the tab)
 *  - `online` event (we just regained connectivity)
 *  - whenever the configured Travel folder id changes (user re-picks)
 *
 * Coalesces concurrent calls: a pull already in flight skips re-entry; if
 * another trigger fires while one is running, a follow-up pull is queued so
 * the most recent state on Drive always wins.
 *
 * Silent on errors — `pullDriveInbound` itself returns `null` on failure and
 * the SyncStatus component surfaces any user-visible issues.
 */

import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { getKV } from '@/lib/storage';

import { useAppServices } from './use-app-services';

export function useDriveInboundSync(): void {
  const { pullDriveInbound } = useAppServices();
  const travelFolderId = useLiveQuery(() => getKV('travel_folder_file_id'), []);

  // `undefined` while loading; `null` when not yet picked. We only start
  // pulling once a folder is configured — there's nothing to pull before that.
  const ready = Boolean(pullDriveInbound) && typeof travelFolderId === 'string';

  // Coalesce: at most one pull in flight; if triggered while running, we
  // schedule one follow-up so we never lose the latest signal.
  const inFlight = useRef(false);
  const pendingFollow = useRef(false);

  useEffect(() => {
    if (!ready || !pullDriveInbound) return;

    async function tick(): Promise<void> {
      if (inFlight.current) {
        pendingFollow.current = true;
        return;
      }
      inFlight.current = true;
      try {
        do {
          pendingFollow.current = false;
          await pullDriveInbound!();
        } while (pendingFollow.current);
      } finally {
        inFlight.current = false;
      }
    }

    // Initial pull on mount + whenever the folder changes.
    void tick();

    const onFocus = (): void => {
      void tick();
    };
    const onOnline = (): void => {
      void tick();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [ready, pullDriveInbound, travelFolderId]);
}
