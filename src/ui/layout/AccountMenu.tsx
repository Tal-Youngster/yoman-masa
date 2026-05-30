import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/app/auth-store';
import { User, LogOut } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

/**
 * Profile menu. Used to also carry the "Drive Config" card — that moved to
 * SyncStatus where it lives alongside the live sync state.
 */
export function AccountMenu(): React.JSX.Element | null {
  const { user, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (event.target instanceof Node && menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    void navigate({ to: '/login' });
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
