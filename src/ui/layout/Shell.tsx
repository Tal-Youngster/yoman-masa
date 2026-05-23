import { Outlet } from '@tanstack/react-router';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { BottomNav } from './BottomNav';

export function Shell(): React.JSX.Element {
  return (
    <div className="flex min-h-full flex-col bg-slate-950 text-slate-100">
      <TopBar />
      <div className="flex flex-1">
        <SideNav />
        <main
          className="flex-1 px-4 pb-24 pt-4 md:pb-8"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
