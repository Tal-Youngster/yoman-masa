// @vitest-environment jsdom
/**
 * Sync engine behaviour (ADR-0019).
 *
 * The engine replaced a design that wedged permanently, so most of these are
 * regression tests for specific wedges rather than happy-path coverage: a
 * failure must not disable a trigger, a slow pass must not spawn a second one,
 * and connectivity must reset accumulated backoff.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { backoffMs } from './backoff.js';
import { SyncEngine, VISIBLE_POLL_MS, type SyncEngineDeps } from './engine.js';

interface Harness {
  engine: SyncEngine;
  order: string[];
  pushes: number;
  pulls: number;
  failNext(message: string): void;
  setOnline(v: boolean): void;
  setVisible(v: boolean): void;
  /** Resolve the in-flight push, for interleaving assertions. */
  releasePush?: () => void;
}

function makeEngine(overrides: Partial<SyncEngineDeps> = {}): Harness {
  const state = { online: true, visible: true, failure: null as string | null };
  const h: Harness = {
    order: [],
    pushes: 0,
    pulls: 0,
    failNext(message) {
      state.failure = message;
    },
    setOnline(v) {
      state.online = v;
    },
    setVisible(v) {
      state.visible = v;
    },
    engine: null as unknown as SyncEngine,
  };

  h.engine = new SyncEngine({
    push: () => {
      h.pushes += 1;
      h.order.push('push');
      if (state.failure !== null) {
        const msg = state.failure;
        state.failure = null;
        return Promise.reject(new Error(msg));
      }
      return Promise.resolve({
        processed: 0,
        applied: 0,
        retried: 0,
        blocked: 0,
        deadLettered: 0,
        skipped: 0,
      });
    },
    pull: () => {
      h.pulls += 1;
      h.order.push('pull');
      return Promise.resolve({ scanned: 0, upserted: 0, removed: 0, skipped: 0, errors: 0 });
    },
    counts: () => Promise.resolve({ pending: 0, dead: 0 }),
    isOnline: () => state.online,
    isVisible: () => state.visible,
    ...overrides,
  });

  return h;
}

/** Let queued microtasks (the async pass) settle without advancing timers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncEngine — pass ordering', () => {
  it('pushes before pulling so a pull cannot clobber a fresh local edit', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();

    expect(h.order).toEqual(['push', 'pull']);
    h.engine.stop();
  });

  it('runs one pass at a time and coalesces triggers into a single follow-up', async () => {
    let releasePush: () => void = () => undefined;
    const h = makeEngine({
      push: () =>
        new Promise((resolve) => {
          releasePush = () =>
            resolve({
              processed: 0,
              applied: 0,
              retried: 0,
              blocked: 0,
              deadLettered: 0,
              skipped: 0,
            });
        }),
    });

    h.engine.start();
    await settle();
    expect(h.pulls).toBe(0); // still inside the first push

    // Five triggers while a pass is in flight must not start five passes.
    for (let i = 0; i < 5; i += 1) h.engine.wake();
    await settle();
    expect(h.pulls).toBe(0);

    releasePush();
    await settle();
    releasePush();
    await settle();

    // Exactly one coalesced follow-up pass, not five.
    expect(h.pulls).toBe(2);
    h.engine.stop();
  });
});

describe('SyncEngine — failure never latches', () => {
  /**
   * The core regression. The previous implementation gated its auto-sync
   * effect on `!errorMsg`, so the first transient failure switched sync off
   * until a manual click. Here a failure must leave every trigger live.
   */
  it('keeps accepting triggers after a failed pass', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();

    h.failNext('network down');
    h.engine.wake();
    await settle();
    expect(h.engine.getState().phase).toBe('error');

    h.engine.wake();
    await settle();

    expect(h.engine.getState().phase).toBe('idle');
    expect(h.engine.getState().lastError).toBeNull();
    h.engine.stop();
  });

  it('schedules its own retry with exponential backoff', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();
    const baseline = h.pushes;

    h.failNext('boom');
    h.engine.wake();
    await settle();
    expect(h.pushes).toBe(baseline + 1);

    // Nothing fires early...
    await vi.advanceTimersByTimeAsync(backoffMs(0) - 1);
    await settle();
    expect(h.pushes).toBe(baseline + 1);

    // ...and the retry fires on its own, with no user action.
    await vi.advanceTimersByTimeAsync(2);
    await settle();
    expect(h.pushes).toBe(baseline + 2);
    h.engine.stop();
  });

  it('reports a failure as a display state, not a stop', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();

    h.failNext('kaboom');
    h.engine.wake();
    await settle();

    expect(h.engine.getState()).toMatchObject({ phase: 'error', lastError: 'kaboom' });
    h.engine.stop();
  });
});

describe('SyncEngine — connectivity', () => {
  it('does not attempt a pass while offline', async () => {
    const h = makeEngine();
    h.setOnline(false);
    h.engine.start();
    await settle();

    expect(h.pushes).toBe(0);
    expect(h.engine.getState().phase).toBe('offline');
    h.engine.stop();
  });

  it('resets accumulated backoff when connectivity returns', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();

    // Rack up failures so the backoff window is long.
    for (let i = 0; i < 3; i += 1) {
      h.failNext('offline-ish');
      h.engine.wake();
      await settle();
      await vi.advanceTimersByTimeAsync(backoffMs(i));
      await settle();
    }
    const before = h.pushes;

    // Reconnecting invalidates the reason for every prior failure, so it must
    // retry immediately rather than serving out the accumulated delay.
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(h.pushes).toBeGreaterThan(before);
    expect(h.engine.getState().lastError).toBeNull();
    h.engine.stop();
  });
});

describe('SyncEngine — polling', () => {
  it('polls on an interval while visible', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();
    const baseline = h.pushes;

    await vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS);
    await settle();
    expect(h.pushes).toBe(baseline + 1);

    await vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS);
    await settle();
    expect(h.pushes).toBe(baseline + 2);
    h.engine.stop();
  });

  it('stops polling when the document is hidden and resumes on return', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();

    h.setVisible(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    const whileHidden = h.pushes;

    await vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS * 3);
    await settle();
    expect(h.pushes).toBe(whileHidden);

    // Returning to the tab syncs immediately rather than waiting for a tick.
    h.setVisible(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(h.pushes).toBe(whileHidden + 1);
    h.engine.stop();
  });

  it('stops all timers and listeners on stop()', async () => {
    const h = makeEngine();
    h.engine.start();
    await settle();
    h.engine.stop();
    const after = h.pushes;

    await vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS * 3);
    window.dispatchEvent(new Event('focus'));
    await settle();

    expect(h.pushes).toBe(after);
  });
});

describe('SyncEngine — observation', () => {
  it('emits current state on subscribe and on every change', async () => {
    const h = makeEngine();
    const seen: string[] = [];
    const unsubscribe = h.engine.subscribe((s) => seen.push(s.phase));

    expect(seen).toEqual(['idle']);

    h.engine.start();
    await settle();

    expect(seen).toContain('syncing');
    expect(seen[seen.length - 1]).toBe('idle');

    unsubscribe();
    const count = seen.length;
    h.engine.wake();
    await settle();
    expect(seen).toHaveLength(count);
    h.engine.stop();
  });

  it('surfaces pending and dead queue counts', async () => {
    const h = makeEngine({ counts: () => Promise.resolve({ pending: 3, dead: 2 }) });
    h.engine.start();
    await settle();

    expect(h.engine.getState()).toMatchObject({ pending: 3, dead: 2 });
    h.engine.stop();
  });

  it('survives a failure to read counts', async () => {
    const h = makeEngine({ counts: () => Promise.reject(new Error('dexie closed')) });
    h.engine.start();
    await settle();

    expect(h.engine.getState().phase).toBe('idle');
    h.engine.stop();
  });
});
