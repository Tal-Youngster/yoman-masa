import { TripSwitcher } from './TripSwitcher';

export function TopBar(): React.JSX.Element {
  return (
    <header
      className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-outline-variant bg-surface/95 px-4 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-primary">
          ✈
        </span>
        <h1 className="text-sm font-semibold text-on-surface">Travel Journal</h1>
      </div>
      <TripSwitcher />
    </header>
  );
}
