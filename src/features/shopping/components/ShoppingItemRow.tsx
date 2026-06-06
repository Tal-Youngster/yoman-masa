import { useState } from 'react';
import type { ShoppingItem } from '@/domain/shopping-item';
import { Button } from '@/ui/components';

export interface ShoppingItemRowProps {
  item: ShoppingItem;
  onToggle: (item: ShoppingItem) => void;
  onEdit: (item: ShoppingItem) => void;
  onDelete: (item: ShoppingItem) => void;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function formatCost(cost: ShoppingItem['estimated_cost']): string {
  if (!cost) return '';
  return `${cost.amount.toFixed(2)} ${cost.currency}`;
}

export function ShoppingItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: ShoppingItemRowProps): React.JSX.Element {
  const [hover, setHover] = useState(false);
  const bought = item.bought;

  return (
    <div
      className="group flex items-start gap-3 border-b border-outline-variant py-2.5 last:border-0 hover:bg-surface-variant/30"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-label={bought ? 'Mark item not bought' : 'Mark item bought'}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          bought
            ? 'bg-primary border-transparent text-on-primary'
            : 'border-on-surface-variant hover:bg-on-surface/5 bg-transparent'
        }`}
      >
        {bought && <CheckIcon className="h-3 w-3" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-sm ${
            bought ? 'text-on-surface-variant line-through' : 'font-medium text-on-surface'
          }`}
        >
          {item.name}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {item.quantity !== undefined && (
            <span className="text-on-surface-variant">×{item.quantity}</span>
          )}
          {item.estimated_cost && (
            <span className="text-on-surface-variant">{formatCost(item.estimated_cost)}</span>
          )}
          {!bought &&
            item.tags.map((tag) => (
              <span key={tag} className="text-on-surface-variant">
                #{tag}
              </span>
            ))}
          {bought && item.bought_date && (
            <span className="text-on-surface-variant">{item.bought_date}</span>
          )}
        </div>
      </div>

      <div
        className={`flex shrink-0 gap-1 transition-opacity ${
          hover ? 'opacity-100' : 'opacity-0 md:opacity-0 max-md:opacity-100'
        }`}
      >
        <Button
          variant="ghost"
          onClick={() => onEdit(item)}
          aria-label="Edit item"
          className="h-8 px-2 py-1 text-xs"
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          onClick={() => onDelete(item)}
          aria-label="Delete item"
          className="h-8 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 hover:text-red-600"
        >
          ✕
        </Button>
      </div>
    </div>
  );
}
