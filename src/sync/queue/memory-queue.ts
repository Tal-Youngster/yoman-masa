/**
 * In-memory implementation of {@link WriteQueue}. Used in tests and (optionally)
 * by dev mode before S2 lands. The real S2 implementation will be Dexie-backed
 * and adheres to the same surface.
 */

import { backoffMs, MAX_ATTEMPTS } from '../backoff.js';

import type { NewWriteQueueItem, WriteQueue, WriteQueueItem } from './types.js';

interface Slot {
  item: WriteQueueItem;
  /** Items become `pending` after enqueue; flipped to `inflight` on drainNext. */
  state: 'pending' | 'inflight' | 'failed' | 'dead';
  /** Epoch ms before which `drainNext` must skip this slot. */
  nextAttemptAt: number;
}

export interface MemoryQueueOptions {
  /** Number of retries before marking dead. Defaults to {@link MAX_ATTEMPTS}. */
  retryBudget?: number;
  /** Injectable clock so backoff is assertable without real timers. */
  now?: () => number;
}

export class MemoryWriteQueue implements WriteQueue {
  private readonly slots = new Map<string, Slot>();
  private readonly order: string[] = [];
  private readonly retryBudget: number;
  private readonly now: () => number;

  constructor(opts: MemoryQueueOptions = {}) {
    this.retryBudget = opts.retryBudget ?? MAX_ATTEMPTS;
    this.now = opts.now ?? (() => Date.now());
  }

  enqueue(item: NewWriteQueueItem): Promise<void> {
    if (!this.slots.has(item.id)) {
      const full: WriteQueueItem = {
        ...item,
        nextAttemptAt: item.nextAttemptAt ?? 0,
        dead: item.dead ?? false,
      };
      this.slots.set(item.id, { item: full, state: 'pending', nextAttemptAt: 0 });
      this.order.push(item.id);
    }
    return Promise.resolve();
  }

  /** Mirrors the Dexie adapter: a slot still inside its backoff window is
   *  skipped, not blocked on, so `drainAll` walks past a failing item. */
  drainNext(): Promise<WriteQueueItem | null> {
    const now = this.now();
    for (const id of this.order) {
      const slot = this.slots.get(id);
      if (!slot) continue;
      if (slot.state !== 'pending' && slot.state !== 'failed') continue;
      if (slot.nextAttemptAt > now) continue;
      slot.state = 'inflight';
      return Promise.resolve(slot.item);
    }
    return Promise.resolve(null);
  }

  markFailed(id: string, error: string, terminal: boolean): Promise<void> {
    const slot = this.slots.get(id);
    if (!slot) return Promise.resolve();
    const newAttempts = slot.item.attempts + 1;
    slot.item = { ...slot.item, attempts: newAttempts, lastError: error };
    if (terminal || newAttempts >= this.retryBudget) {
      slot.state = 'dead';
      slot.item = { ...slot.item, dead: true };
    } else {
      slot.state = 'failed';
      slot.nextAttemptAt = this.now() + backoffMs(newAttempts);
      slot.item = { ...slot.item, nextAttemptAt: slot.nextAttemptAt };
    }
    return Promise.resolve();
  }

  markApplied(id: string, _newRevision?: string, _fileId?: string): Promise<void> {
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
