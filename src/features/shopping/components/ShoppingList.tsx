import type { ShoppingItem } from '@/domain/shopping-item';
import { ShoppingItemRow } from './ShoppingItemRow';

export interface ShoppingListProps {
  items: ShoppingItem[];
  onToggle: (item: ShoppingItem) => void;
  onEdit: (item: ShoppingItem) => void;
  onDelete: (item: ShoppingItem) => void;
}

export function ShoppingList({
  items,
  onToggle,
  onEdit,
  onDelete,
}: ShoppingListProps): React.JSX.Element {
  if (items.length === 0) {
    return <p className="text-sm text-on-surface-variant">No items yet. Tap “+” to add one.</p>;
  }

  const unbought = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);

  const renderSection = (title: string, list: ShoppingItem[], titleColor = 'text-on-surface') => {
    if (list.length === 0) return null;
    return (
      <div className="mb-6 flex flex-col gap-1">
        <h3 className={`text-sm font-bold ${titleColor} mb-2`}>{title}</h3>
        <div className="flex flex-col">
          {list.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {renderSection('To buy', unbought)}
      {renderSection('Bought', bought, 'text-on-surface-variant')}
    </div>
  );
}
