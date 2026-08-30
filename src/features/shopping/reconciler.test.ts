import { describe, it, expect } from 'vitest';
import { ShoppingItemId, TripId } from '@/domain/ids';
import { ShoppingItem } from '@/domain/shopping-item';
import type { WriteQueueItem, WriteOp } from '@/sync/queue';
import { shoppingItemReconciler, type ShoppingItemPayload } from './reconciler';
import { shoppingItemBlockRef } from './paths';

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');

function buildItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return ShoppingItem.parse({
    type: 'shopping_item',
    id: ShoppingItemId.parse('shp_01HABCDEFGHJKMNPQRSTVWXYZ0'),
    trip_id: TRIP,
    name: 'Trail runners',
    bought: false,
    ...overrides,
  });
}

function queueItem(item: ShoppingItem, op: WriteOp): WriteQueueItem<ShoppingItemPayload> {
  return {
    id: 'wq_1',
    entityType: 'shopping_item',
    entityId: item.id,
    op,
    payload: { item },
    baseRevision: null,
    fileId: null,
    resolvedPath: 'Travel/Trips/trip/Shopping.md',
    attempts: 0,
    lastError: null,
    createdAt: '2026-06-06T00:00:00.000Z',
    nextAttemptAt: 0,
    dead: false,
  };
}

const EXISTING = `---
type: shopping
trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0
---

# Trip shopping

- [ ] Trail runners ^s-01HABCDEFGHJKMNPQRSTVWXYZ0
- [x] Sunscreen (qty:: 2) ✅ 2026-05-10 #toiletries ^s-01HABCDEFGHJKMNPQRSTVWXYZ1

A note I keep here.
`;

describe('shoppingItemReconciler.applyEdit', () => {
  it('creates a new single-item file when content is empty', () => {
    const item = buildItem();
    const out = shoppingItemReconciler.applyEdit('', queueItem(item, 'create'));
    expect(out).toContain('type: shopping');
    expect(out).toContain('trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0');
    expect(out).toContain(`^${shoppingItemBlockRef(item.id)}`);
  });

  it('replaces an existing line and leaves siblings + notes untouched', () => {
    const item = buildItem({
      bought: true,
      bought_date: '2026-06-01' as ShoppingItem['bought_date'],
      quantity: 1,
    });
    const out = shoppingItemReconciler.applyEdit(EXISTING, queueItem(item, 'update'));
    expect(out).toContain(
      '- [x] Trail runners (qty:: 1) ✅ 2026-06-01 ^s-01HABCDEFGHJKMNPQRSTVWXYZ0',
    );
    expect(out).toContain(
      '- [x] Sunscreen (qty:: 2) ✅ 2026-05-10 #toiletries ^s-01HABCDEFGHJKMNPQRSTVWXYZ1',
    );
    expect(out).toContain('# Trip shopping');
    expect(out).toContain('A note I keep here.');
  });

  it('preserves the existing line indentation on replace', () => {
    const indented = `---
type: shopping
---

  - [ ] Nested item ^s-01HABCDEFGHJKMNPQRSTVWXYZ0
`;
    const item = buildItem({ trip_id: null, name: 'Nested edited' });
    const out = shoppingItemReconciler.applyEdit(indented, queueItem(item, 'update'));
    expect(out).toContain('  - [ ] Nested edited ^s-01HABCDEFGHJKMNPQRSTVWXYZ0');
  });

  it('appends when the target line does not exist yet (insert)', () => {
    const fresh = buildItem({
      id: ShoppingItemId.parse('shp_01HABCDEFGHJKMNPQRSTVWXYZ9'),
      name: 'Hat',
    });
    const out = shoppingItemReconciler.applyEdit(EXISTING, queueItem(fresh, 'update'));
    expect(out).toContain('- [ ] Hat ^s-01HABCDEFGHJKMNPQRSTVWXYZ9');
    expect(out).toContain('- [ ] Trail runners ^s-01HABCDEFGHJKMNPQRSTVWXYZ0');
  });

  it('removes a line on delete', () => {
    const item = buildItem();
    const out = shoppingItemReconciler.applyEdit(EXISTING, queueItem(item, 'delete'));
    expect(out).not.toContain('- [ ] Trail runners ^s-01HABCDEFGHJKMNPQRSTVWXYZ0');
    expect(out).toContain(
      '- [x] Sunscreen (qty:: 2) ✅ 2026-05-10 #toiletries ^s-01HABCDEFGHJKMNPQRSTVWXYZ1',
    );
  });

  it('leaves content unchanged when deleting a line that is already gone', () => {
    const ghost = buildItem({ id: ShoppingItemId.parse('shp_01HABCDEFGHJKMNPQRSTVWXYZ8') });
    const out = shoppingItemReconciler.applyEdit(EXISTING, queueItem(ghost, 'delete'));
    expect(out).toBe(EXISTING);
  });
});
