import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/storage';
import { useAppServices } from '@/app/use-app-services';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';

export function SyncStatus(): React.JSX.Element | null {
  const { tripsAdmin, user } = useAppServices() as any; // Hack: user is from useAuthStore, but AppServices doesn't have it. We only show it if user is logged in. Actually wait, let's just render.
  
  // We only want to run sync if the user is logged in / auth is initialized.
  // We can just rely on the AccountMenu/TopBar mounting condition.
  
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const pendingCount = useLiveQuery(() => db.write_queue.count(), []) ?? 0;
  const firstPending = useLiveQuery(() => db.write_queue.orderBy('created_at').first(), []);
  
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

  useEffect(() => {
    let mounted = true;
    if (pendingCount > 0 && isOnline && !syncing && !errorMsg && tripsAdmin) {
      const timeout = setTimeout(async () => {
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
        } else {
          setErrorMsg(null);
        }
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
  let iconClass = "text-green-500";
  let bgClass = "bg-green-500/10";
  
  if (syncing) {
    Icon = RefreshCw;
    iconClass = "text-primary animate-spin";
    bgClass = "bg-primary/10";
  } else if (hasError) {
    Icon = AlertTriangle;
    iconClass = "text-red-500";
    bgClass = "bg-red-500/10";
  } else if (!isSynced) {
    Icon = CloudOff;
    iconClass = "text-amber-500";
    bgClass = "bg-amber-500/10";
  }

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => hasError && setIsOpen(!isOpen)}
        className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ${bgClass} transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1`}
        title={isSynced ? 'Synced' : syncing ? 'Syncing...' : hasError ? 'Sync Error' : 'Pending Sync'}
      >
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </button>

      {isOpen && hasError && (
        <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl bg-surface border border-outline-variant shadow-lg z-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="font-semibold text-sm text-on-surface">Sync Error</span>
          </div>
          {!isOnline ? (
            <p className="text-xs text-on-surface-variant">You are offline. Sync will resume when connection is restored.</p>
          ) : (
            <div className="text-xs text-on-surface-variant flex flex-col gap-2">
              <p>{errorMsg}</p>
              {firstPending?.last_error && (
                <p className="text-red-500 break-words font-mono text-[10px] bg-red-500/10 p-2 rounded">
                  {firstPending.last_error}
                </p>
              )}
              <button 
                onClick={() => {
                  setErrorMsg(null);
                  setIsOpen(false);
                }}
                className="mt-2 text-primary font-medium text-xs text-center border border-primary/20 rounded py-1.5 hover:bg-primary/10 transition-colors"
              >
                Retry Now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
