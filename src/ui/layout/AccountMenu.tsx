import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/app/auth-store';
import { useAppServices } from '@/app/use-app-services';
import { User, LogOut, HardDrive, FolderOpen } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

export function AccountMenu(): React.JSX.Element | null {
  const { user, logout } = useAuthStore();
  const { drive, kv } = useAppServices();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [busy, setBusy] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (event.target instanceof Node && menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      kv.get('travel_folder_file_id')
        .then(setCurrentFolderId)
        .catch(console.error);
    }
  }, [isOpen, kv]);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    void navigate({ to: '/login' });
  };

  const handlePickDrive = async () => {
    if (!drive) {
      setDriveError('Drive client not configured');
      return;
    }
    setBusy(true);
    setDriveError(null);
    try {
      const picked = await drive.pickFolder();
      await kv.set('travel_folder_file_id', picked.id);
      await kv.set('vault_root_file_id', picked.id);
      setCurrentFolderId(picked.id);
      window.location.reload();
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-variant hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 shadow-sm"
        aria-label="Account menu"
      >
        {user.picture ? (
          <img src={user.picture} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          <User className="h-5 w-5 text-on-surface-variant" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl bg-surface border border-outline-variant shadow-lg animate-in fade-in zoom-in-95 duration-100">
          <div className="flex flex-col px-4 py-4 border-b border-outline-variant bg-surface-variant/30 rounded-t-xl">
            <span className="text-sm font-semibold text-on-surface truncate">{user.name}</span>
            <span className="text-xs text-on-surface-variant truncate mt-0.5">{user.email}</span>
          </div>
          
          <div className="px-4 py-3 border-b border-outline-variant">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-on-surface flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                Drive Config
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {currentFolderId ? 'Connected' : 'Not Set'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mb-3 leading-relaxed">
              Select the Google Drive folder where your travel data will be stored and synced.
            </p>
            <button
              onClick={() => void handlePickDrive()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              {busy ? 'Opening picker...' : 'Set Data Directory'}
            </button>
            {driveError && <p className="text-xs text-red-500 mt-2">{driveError}</p>}
          </div>

          <div className="p-2">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
