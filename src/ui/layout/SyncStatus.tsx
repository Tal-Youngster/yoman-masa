import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getKV } from '@/lib/storage';
import { useAppServices } from '@/app/use-app-services';
import { useSyncState } from '@/app/use-sync-engine';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, FolderOpen, HardDrive } from 'lucide-react';

/**
 * Top-bar Drive sync indicator + Drive folder configuration.
 *
 * Passive by design (ADR-0019). This component observes the sync engine; it
 * cannot start, stop, or influence a sync. The "Sync now" and "Resync from
 * Drive" buttons are deliberately gone: every trigger they stood in for is
 * automatic, and their recovery role (a stale change token, local drift) is
 * now self-healing via the backfill fallback in the pull worker.
 *
 * What remains is the folder picker, which is *configuration* rather than
 * sync — the user has to tell us which vault to treat as the database.
 */
export function SyncStatus(): React.JSX.Element | null {
  const { drive, kv } = useAppServices();
  const { phase, pending, dead, lastError } = useSyncState();

  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // `undefined` while loading; `null` when no folder is configured.
  const travelFolderId = useLiveQuery(() => getKV('travel_folder_file_id'), []);
  const travelFolderName = useLiveQuery(() => getKV('travel_folder_name'), []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { Icon, iconClass, bgClass, statusText, statusClass } = presentation(
    phase,
    pending,
    dead,
  );

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
      // Full reload so every live query and the sync engine re-bind to the new
      // folder cleanly. The persisted change token is scoped to the folder it
      // was minted against, so the first pull after this correctly backfills.
      window.location.reload();
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    } finally {
      setPickBusy(false);
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
                className={`font-medium text-right ${statusClass}`}
                data-testid="sync-status-text"
              >
                {statusText}
              </span>
            </div>
            {lastError && phase === 'error' && (
              <p className="text-red-500 break-words font-mono text-[10px] bg-red-500/10 p-2 rounded">
                {lastError}
              </p>
            )}
            {dead > 0 && (
              <p className="text-on-surface-variant leading-snug" data-testid="sync-dead-note">
                {dead} change{dead === 1 ? '' : 's'} couldn’t be saved to Drive after repeated
                attempts. They’re kept locally.
              </p>
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

/**
 * Icon + label for a phase. `error` is intentionally worded as a delay rather
 * than a fault the user must act on: the engine keeps retrying on its own, so
 * prompting for intervention would be both useless and untrue.
 */
function presentation(
  phase: ReturnType<typeof useSyncState>['phase'],
  pending: number,
  dead: number,
): {
  Icon: typeof Cloud;
  iconClass: string;
  bgClass: string;
  statusText: string;
  statusClass: string;
} {
  if (phase === 'syncing') {
    return {
      Icon: RefreshCw,
      iconClass: 'text-primary animate-spin',
      bgClass: 'bg-primary/10',
      statusText: 'Syncing…',
      statusClass: 'text-primary',
    };
  }
  if (phase === 'offline') {
    return {
      Icon: CloudOff,
      iconClass: 'text-on-surface-variant',
      bgClass: 'bg-surface-variant',
      statusText: pending > 0 ? `Offline — ${pending} waiting` : 'Offline',
      statusClass: 'text-on-surface-variant',
    };
  }
  if (phase === 'error') {
    return {
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
      bgClass: 'bg-amber-500/10',
      statusText: 'Retrying…',
      statusClass: 'text-amber-600',
    };
  }
  if (dead > 0) {
    return {
      Icon: AlertTriangle,
      iconClass: 'text-red-500',
      bgClass: 'bg-red-500/10',
      statusText: `${dead} not saved`,
      statusClass: 'text-red-500',
    };
  }
  if (pending > 0) {
    return {
      Icon: Cloud,
      iconClass: 'text-amber-500',
      bgClass: 'bg-amber-500/10',
      statusText: `${pending} pending`,
      statusClass: 'text-amber-600',
    };
  }
  return {
    Icon: Cloud,
    iconClass: 'text-green-500',
    bgClass: 'bg-green-500/10',
    statusText: 'Up to date',
    statusClass: 'text-green-600',
  };
}
