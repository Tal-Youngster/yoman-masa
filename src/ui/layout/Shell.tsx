import { Outlet } from '@tanstack/react-router';
import { useValidateTravelFolder } from '@/app/use-validate-travel-folder';
import { useDriveInboundSync } from '@/app/use-drive-inbound-sync';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { BottomNav } from './BottomNav';
import { InstallBanner } from '@/ui/install/InstallBanner';

export function Shell(): React.JSX.Element {
  // Validate the persisted Travel folder id once on startup, regardless of
  // route. A stale id (e.g. a leftover FakeDrive id) otherwise makes the sync
  // queue 404-loop forever; this drops it so the first-run picker can recover.
  useValidateTravelFolder();
  // Run inbound Drive → Dexie sync on mount + focus + online + folder change
  // so Obsidian-side edits and multi-device changes converge into the app.
  useDriveInboundSync();

  return (
    <div className="flex min-h-full flex-col bg-background text-on-surface">
      <TopBar />
      <div className="flex flex-1 min-w-0">
        <SideNav />
        <main
          className="flex-1 flex justify-center min-w-0"
        >
          <div
            className="w-full max-w-[1200px] px-5 py-6 md:px-8 md:py-10 lg:px-16 lg:py-16 pb-24 md:pb-16"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
          >
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <InstallBanner />
    </div>
  );
}
