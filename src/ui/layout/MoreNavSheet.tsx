import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { GripVertical, Settings2, Check } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

  // TouchSensor delay prevents drag from hijacking scroll on mobile; keyboard sensor keeps reordering
  // reachable for users who can't (or don't want to) drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tabOrder.indexOf(active.id as TabDef['to']);
    const newIndex = tabOrder.indexOf(over.id as TabDef['to']);
    if (oldIndex === -1 || newIndex === -1) return;
    setTabOrder(arrayMove(tabOrder, oldIndex, newIndex));
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tabOrder} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                    Pinned to Navbar (Max 4)
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {pinnedTabs.map((tab) => (
                      <SortableTabItem key={tab.to} tab={tab} />
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                    In More Menu
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {moreTabs.map((tab) => (
                      <SortableTabItem key={tab.to} tab={tab} />
                    ))}
                  </ul>
                </div>
              </div>
            </SortableContext>
          </DndContext>
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

function SortableTabItem({ tab }: { tab: TabDef }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.to,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 'auto',
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl bg-surface-container-low px-2 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab rounded p-1.5 text-on-surface-variant hover:bg-surface-container-highest active:cursor-grabbing"
        aria-label={`Reorder ${tab.label}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <TabIcon name={tab.icon} className="w-5 h-5 text-on-surface-variant" />
      <span className="text-sm font-medium text-on-surface">{tab.label}</span>
    </li>
  );
}
