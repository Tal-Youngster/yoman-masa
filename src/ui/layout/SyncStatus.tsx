import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getKV } from '@/lib/storage';
import { useAppServices } from '@/app/use-app-services';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, FolderOpen, HardDrive } from 'lucide-react';

/**
 * Top-bar Drive sync state + Drive configuration.
 *
 * Drives the cloud icon (state) and a click-to-open popover that surfaces:
 *  - the picked Travel folder name (offline-safe — captured at pick time and
 *    persisted in KV; see `travel_folder_name`),
 *  - the live sync status as text (mirrors the icon),
 *  - the last sync error message + the failing item's `last_error` payload
 *    when present,
 *  - "Change folder" → re-runs the Picker (the same flow `AccountMenu` used
 *    to host),
 *  - "Sync now" → drains the write queue and triggers an inbound pull.
 *
 * Auto-sync behaviour (1.5s debounce, error latching, online/offline
 * handling) is unchanged — only the popover wraps it now.
 */
export function SyncStatus(): React.JSX.Element | null {
  const { tripsAdmin, drive, kv, pullDriveInbound } = useAppServices();

  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const pendingCount = useLiveQuery(() => db.write_queue.count(), []) ?? 0;
  const firstPending = useLiveQuery(() => db.write_queue.orderBy('created_at').first(), []);
  // `undefined` while loading; `null` when no folder is configured.
  const travelFolderId = useLiveQuery(() => getKV('travel_folder_file_id'), []);
  const travelFolderName = useLiveQuery(() => getKV('travel_folder_name'), []);
  const lastFolderId = useRef<string | null | undefined>(undefined);

  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setErrorMsg(null); // Clear error to re-trigger sync
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // When the Travel folder is (re-)picked, clear any latched error so a queue
  // that stalled on a missing/stale folder resumes on its own — no need to wait
  // for a reconnect or a manual "Retry Now". We only react to a *change* to a
  // valid id (not the initial load), so a folder that was valid all along
  // doesn't wipe an unrelated transient error.
  useEffect(() => {
    if (travelFolderId === undefined) return; // still loading
    const changed =
      lastFolderId.current !== undefined && lastFolderId.current !== travelFolderId;
    lastFolderId.current = travelFolderId;
    if (changed && travelFolderId) setErrorMsg(null);
  }, [travelFolderId]);

  useEffect(() => {
    let mounted = true;
    if (pendingCount > 0 && isOnline && !syncing && !errorMsg && tripsAdmin) {
      const timeout = setTimeout(() => {
        void (async () => {
          if (!mounted) return;
          setSyncing(true);
          const report = await tripsAdmin.syncNow();

          // We MUST update state even if the effect cleaned up (e.g. pendingCount changed)
          // otherwise the syncing animation gets stuck forever!
          setSyncing(false);
          if (!report) {
            setErrorMsg('Sync failed. Please check your connection or Drive access.');
          } else if (report.deadLettered > 0) {
            setErrorMsg(`Failed to sync ${report.deadLettered} item(s). They are permanently stuck.`);
          } else if (report.blocked > 0) {
            // A blocked item won't succeed on retry (e.g. the Travel folder id
            // is missing/stale). Latch the error so we stop the 1.5s retry loop
            // and prompt the user to re-pick their folder. Cleared on reconnect
            // or via "Retry Now".
            setErrorMsg('Sync needs attention — re-pick your Travel folder to resume syncing.');
          } else if (report.retried > 0) {
            // A transient failure stalled the queue. Pause auto-retry (rather
            // than hammering every 1.5s); it resumes on reconnect or "Retry Now".
            setErrorMsg('Sync paused after a temporary error. It will retry when you reconnect.');
          } else {
            setErrorMsg(null);
          }
        })();
      }, 1500); // 1.5s debounce for batch writes
      return () => {
        mounted = false;
        clearTimeout(timeout);
      };
    }
  }, [pendingCount, isOnline, syncing, errorMsg, tripsAdmin]);

  const hasError = errorMsg !== null || (!isOnline && pendingCount > 0);
  const isSynced = pendingCount === 0;

  // Icon logic
  let Icon = Cloud;
  let iconClass = 'text-green-500';
  let bgClass = 'bg-green-500/10';

  if (syncing) {
    Icon = RefreshCw;
    iconClass = 'text-primary animate-spin';
    bgClass = 'bg-primary/10';
  } else if (hasError) {
    Icon = AlertTriangle;
    iconClass = 'text-red-500';
    bgClass = 'bg-red-500/10';
  } else if (!isSynced) {
    Icon = CloudOff;
    iconClass = 'text-amber-500';
    bgClass = 'bg-amber-500/10';
  }

  // Status text. Mirrors the icon — kept side-by-side here so the popover and
  // the tooltip stay consistent.
  let statusText: string;
  if (!isOnline) statusText = 'Offline';
  else if (syncing) statusText = 'Syncing…';
  else if (hasError) statusText = 'Sync error';
  else if (!isSynced) statusText = `${pendingCount} pending`;
  else statusText = 'All synced';

  const handleChangeFolder = async (): Promise<void> => {
    if (!drive) {
      setPickError('Drive client not configured');
      return;
    }
    setPickBusy(true);
    setPickError(null);
    try {
      const picked = await drive.pickFolder();
      await kv.set('travel_folder_file_id', picked.id);
      await kv.set('vault_root_file_id', picked.id);
      await kv.set('travel_folder_name', picked.name);
      // Full reload so the sync worker, inbound puller, and any live queries
      // re-bind to the new folder cleanly — same behaviour the old AccountMenu
      // version had.
      window.location.reload();
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    } finally {
      setPickBusy(false);
    }
  };

  const handleSyncNow = async (): Promise<void> => {
    if (!tripsAdmin) return;
    setErrorMsg(null);
    setSyncing(true);
    try {
      // Outbound first so any local edits land before we pull and risk a
      // momentarily-inconsistent view. Inbound is best-effort and silent on
      // failure; the outbound report already surfaces its own errors.
      await tripsAdmin.syncNow();
      if (pullDriveInbound) await pullDriveInbound();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ${bgClass} transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1`}
        title={statusText}
        aria-label={`Drive sync — ${statusText}`}
      >
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl bg-surface border border-outline-variant shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant bg-surface-variant/30 rounded-t-xl">
            <HardDrive className="w-4 h-4 text-on-surface-variant" />
            <span className="text-sm font-semibold text-on-surface">Drive Sync</span>
          </div>

          <div className="px-4 py-3 border-b border-outline-variant flex flex-col gap-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-on-surface-variant">Folder</span>
              <span
                className="text-on-surface font-medium text-right truncate max-w-[180px]"
                title={travelFolderName ?? undefined}
                data-testid="sync-folder-name"
              >
                {travelFolderName ?? (travelFolderId ? 'Configured' : 'Not configured')}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-on-surface-variant">Status</span>
              <span
                className={`font-medium text-right ${
                  hasError ? 'text-red-500' : syncing ? 'text-primary' : isSynced ? 'text-green-600' : 'text-amber-600'
                }`}
                data-testid="sync-status-text"
              >
                {statusText}
              </span>
            </div>
            {hasError && (
              <div className="mt-1 flex flex-col gap-1">
                {errorMsg && (
                  <p className="text-on-surface-variant leading-snug">{errorMsg}</p>
                )}
                {firstPending?.last_error && (
                  <p className="text-red-500 break-words font-mono text-[10px] bg-red-500/10 p-2 rounded">
                    {firstPending.last_error}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="px-4 py-3 flex flex-col gap-2">
            <button
              onClick={() => void handleChangeFolder()}
              disabled={pickBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-60"
              data-testid="sync-change-folder"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              {pickBusy ? 'Opening picker…' : travelFolderId ? 'Change folder' : 'Set Drive folder'}
            </button>
            <button
              onClick={() => void handleSyncNow()}
              disabled={syncing || !tripsAdmin || !travelFolderId}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-60"
              data-testid="sync-now"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {pickError && (
              <p className="text-xs text-red-500" role="alert">
                {pickError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
