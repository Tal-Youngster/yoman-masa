import { useState, type FormEvent } from 'react';
import { Button, CurrencyPicker, Input } from '@/ui/components';
import { currency, type Currency } from '@/domain/money';
import { ShoppingItem } from '@/domain/shopping-item';
import type {
  AddShoppingItemInput,
  ShoppingAdminService,
  ShoppingScope,
} from '../shopping-admin';

export interface ShoppingFormProps {
  scope: ShoppingScope;
  admin: ShoppingAdminService;
  /** Pass to edit an existing item; omit to create. */
  item?: ShoppingItem;
  /** Default currency for new items — typically the active trip's home_currency. */
  defaultCurrency: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ShoppingForm({
  scope,
  admin,
  item,
  defaultCurrency,
  onSuccess,
  onCancel,
}: ShoppingFormProps): React.JSX.Element {
  const editing = item !== undefined;
  const [name, setName] = useState(item?.name ?? '');
  const [quantity, setQuantity] = useState<string>(item?.quantity ? String(item.quantity) : '');
  const [costAmount, setCostAmount] = useState<string>(
    item?.estimated_cost ? String(item.estimated_cost.amount) : '',
  );
  const [costCcy, setCostCcy] = useState<string>(
    item?.estimated_cost?.currency ?? defaultCurrency,
  );
  const [tags, setTags] = useState((item?.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim() === '') {
      setError('Name is required');
      return;
    }

    let qty: number | undefined;
    if (quantity.trim() !== '') {
      const parsed = Number(quantity);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError('Quantity must be a positive integer');
        return;
      }
      qty = parsed;
    }

    let cost: { amount: number; currency: Currency } | undefined;
    if (costAmount.trim() !== '') {
      const amt = Number(costAmount);
      if (!Number.isFinite(amt) || amt < 0) {
        setError('Cost must be a non-negative number');
        return;
      }
      try {
        cost = { amount: amt, currency: currency(costCcy) };
      } catch {
        setError('Invalid currency code');
        return;
      }
    }

    const tagList = tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    setSubmitting(true);
    try {
      if (editing && item) {
        // Rebuild from the always-present fields so clearing a qty/cost actually
        // drops it (a spread would keep the stale value, and setting it to
        // `undefined` violates exactOptionalPropertyTypes).
        const updated = ShoppingItem.parse({
          type: 'shopping_item',
          id: item.id,
          trip_id: item.trip_id,
          name: name.trim(),
          bought: item.bought,
          tags: tagList,
          unknown_tokens: item.unknown_tokens,
          ...(item.bought_date ? { bought_date: item.bought_date } : {}),
          ...(item.category ? { category: item.category } : {}),
          ...(qty !== undefined ? { quantity: qty } : {}),
          ...(cost ? { estimated_cost: cost } : {}),
        });
        await admin.updateItem(scope, updated);
      } else {
        const input: AddShoppingItemInput = {
          name: name.trim(),
          tags: tagList,
          ...(qty !== undefined ? { quantity: qty } : {}),
          ...(cost ? { estimated_cost: cost } : {}),
        };
        await admin.addItem(scope, input);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Trail runners"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Quantity (optional)</span>
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="1"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Estimated cost (optional)</span>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={costAmount}
            onChange={(e) => setCostAmount(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <CurrencyPicker
          label="Currency"
          value={costCcy}
          onChange={setCostCcy}
          data-testid="shopping-form-currency"
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Tags (comma-separated)</span>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="gear/shoes, urgent"
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : editing ? 'Save' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}
