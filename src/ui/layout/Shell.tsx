import { Outlet } from '@tanstack/react-router';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { BottomNav } from './BottomNav';

export function Shell(): React.JSX.Element {
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
    </div>
  );
}
