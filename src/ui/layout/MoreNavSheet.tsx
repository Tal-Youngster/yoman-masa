import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUp, ArrowDown, Settings2, Check } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { TABS, type TabDef } from './tabs';
import { useNavStore } from '../../lib/navStore';
import { TabIcon } from './SideNav';

export interface MoreNavSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MoreNavSheet({ open, onClose }: MoreNavSheetProps): React.JSX.Element {
  const { tabOrder, setTabOrder } = useNavStore();
  const [isEditing, setIsEditing] = useState(false);

  const sortedTabs = tabOrder
    .map((to) => TABS.find((t) => t.to === to))
    .filter((t): t is TabDef => t !== undefined);

  const pinnedTabs = sortedTabs.slice(0, 4);
  const moreTabs = sortedTabs.slice(4);

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...tabOrder];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    setTabOrder(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index === tabOrder.length - 1) return;
    const newOrder = [...tabOrder];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    setTabOrder(newOrder);
  };

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  const title = (
    <div className="flex items-center gap-2">
      <span>{isEditing ? 'Customize Navigation' : 'More'}</span>
    </div>
  );

  return (
    <Sheet open={open} onClose={handleClose} title={title}>
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container"
          >
            {isEditing ? (
              <>
                <Check className="w-4 h-4" />
                <span>Done</span>
              </>
            ) : (
              <>
                <Settings2 className="w-4 h-4" />
                <span>Customize</span>
              </>
            )}
          </button>
        </div>

        {isEditing ? (
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Pinned to Navbar (Max 4)
              </h3>
              <ul className="flex flex-col gap-1">
                {pinnedTabs.map((tab, i) => (
                  <EditListItem
                    key={tab.to}
                    tab={tab}
                    onMoveUp={() => handleMoveUp(i)}
                    onMoveDown={() => handleMoveDown(i)}
                    isFirst={i === 0}
                    isLast={false}
                  />
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                In More Menu
              </h3>
              <ul className="flex flex-col gap-1">
                {moreTabs.map((tab, i) => {
                  const globalIndex = i + 4;
                  return (
                    <EditListItem
                      key={tab.to}
                      tab={tab}
                      onMoveUp={() => handleMoveUp(globalIndex)}
                      onMoveDown={() => handleMoveDown(globalIndex)}
                      isFirst={false}
                      isLast={globalIndex === tabOrder.length - 1}
                    />
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {moreTabs.map((tab) => (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  activeOptions={{ exact: tab.to === '/' }}
                  onClick={handleClose}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                  activeProps={{
                    className: 'bg-surface-container-highest text-primary font-medium',
                  }}
                >
                  <TabIcon name={tab.icon} className="w-5 h-5" />
                  <span>{tab.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

function EditListItem({
  tab,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  tab: TabDef;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <li className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-2">
      <div className="flex items-center gap-3 text-on-surface">
        <TabIcon name={tab.icon} className="w-5 h-5 text-on-surface-variant" />
        <span className="text-sm font-medium">{tab.label}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-1.5 text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-30"
          aria-label={`Move ${tab.label} up`}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-1.5 text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-30"
          aria-label={`Move ${tab.label} down`}
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}
