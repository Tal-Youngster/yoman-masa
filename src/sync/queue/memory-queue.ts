/**
 * In-memory implementation of {@link WriteQueue}. Used in tests and (optionally)
 * by dev mode before S2 lands. The real S2 implementation will be Dexie-backed
 * and adheres to the same surface.
 */

import type { WriteQueue, WriteQueueItem } from './types.js';

interface Slot {
  item: WriteQueueItem;
  /** Items become `pending` after enqueue; flipped to `inflight` on drainNext. */
  state: 'pending' | 'inflight' | 'failed' | 'dead';
}

export interface MemoryQueueOptions {
  /** Number of retries before marking dead. Defaults to 5. */
  retryBudget?: number;
}

export class MemoryWriteQueue implements WriteQueue {
  private readonly slots = new Map<string, Slot>();
  private readonly order: string[] = [];
  private readonly retryBudget: number;

  constructor(opts: MemoryQueueOptions = {}) {
    this.retryBudget = opts.retryBudget ?? 5;
  }

  enqueue(item: WriteQueueItem): Promise<void> {
    if (!this.slots.has(item.id)) {
      this.slots.set(item.id, { item, state: 'pending' });
      this.order.push(item.id);
    }
    return Promise.resolve();
  }

  drainNext(): Promise<WriteQueueItem | null> {
    for (const id of this.order) {
      const slot = this.slots.get(id);
      if (!slot) continue;
      if (slot.state === 'pending' || slot.state === 'failed') {
        slot.state = 'inflight';
        return Promise.resolve(slot.item);
      }
    }
    return Promise.resolve(null);
  }

  markFailed(id: string, error: string, terminal: boolean): Promise<void> {
    const slot = this.slots.get(id);
    if (!slot) return Promise.resolve();
    const newAttempts = slot.item.attempts + 1;
    const updated: WriteQueueItem = {
      ...slot.item,
      attempts: newAttempts,
      lastError: error,
    };
    slot.item = updated;
    if (terminal || newAttempts >= this.retryBudget) {
      slot.state = 'dead';
    } else {
      slot.state = 'failed';
    }
    return Promise.resolve();
  }

  markApplied(id: string): Promise<void> {
    const slot = this.slots.get(id);
    if (!slot) return Promise.resolve();
    this.slots.delete(id);
    const idx = this.order.indexOf(id);
    if (idx >= 0) this.order.splice(idx, 1);
    return Promise.resolve();
  }

  peek(): Promise<WriteQueueItem | null> {
    for (const id of this.order) {
      const slot = this.slots.get(id);
      if (slot && (slot.state === 'pending' || slot.state === 'failed')) {
        return Promise.resolve(slot.item);
      }
    }
    return Promise.resolve(null);
  }

  size(): Promise<number> {
    let n = 0;
    for (const slot of this.slots.values()) {
      if (slot.state === 'pending' || slot.state === 'failed') n += 1;
    }
    return Promise.resolve(n);
  }

  /** Tests use this to introspect the queue state. */
  inspect(): { id: string; state: Slot['state']; attempts: number; lastError: string | null }[] {
    return this.order.flatMap((id) => {
      const s = this.slots.get(id);
      if (!s) return [];
      return [{ id, state: s.state, attempts: s.item.attempts, lastError: s.item.lastError }];
    });
  }
}
