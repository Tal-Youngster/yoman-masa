/**
 * The continuous sync engine (ADR-0019).
 *
 * Drive is the database. The app writes to it and reads from it, and neither
 * direction has a button. This module owns every trigger, the pass ordering,
 * coalescing, and the backoff curve. It replaces the outbound `useEffect` in
 * `SyncStatus`, the `useDriveInboundSync` hook, and `tripsAdmin.syncNow`.
 *
 * Deliberately framework-free: no React, no Dexie-live-query, no component
 * lifetime. The previous design kept sync state inside a component's effect
 * (with `syncing` in its own dependency array, racing a second independent
 * inbound loop) and that is precisely how it wedged. React subscribes to this;
 * this never depends on React.
 *
 * ## Invariants
 *
 *  1. **At most one pass runs at a time.** Every trigger funnels through
 *     {@link SyncEngine.wake}, which either starts a pass or flags that
 *     another is wanted the moment the current one finishes.
 *  2. **Push always precedes pull within a pass.** Local edits reach Drive
 *     before we read remote state back, so a pull can never resurrect a row
 *     the user just changed.
 *  3. **No failure ever disables a trigger.** Failures schedule; they do not
 *     latch. This is the single most important difference from the code this
 *     replaces.
 */

import { backoffMs } from './backoff.js';

import type { PullReport } from './pull/index.js';
import type { SyncReport } from './queue/index.js';

/** Poll cadence while the document is visible. Zero polling when hidden. */
export const VISIBLE_POLL_MS = 15_000;

/**
 * Ceiling on a single pass. A vault with a large change backlog would
 * otherwise keep one pass running across several scheduled ticks, and from
 * the outside that is indistinguishable from the hang we just removed. The
 * pass stops early and the next one resumes — every op is idempotent and the
 * page token only advances on a genuinely completed pull.
 */
export const MAX_PASS_MS = 120_000;

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  phase: SyncPhase;
  /** Live (non-dead) write queue depth. */
  pending: number;
  /** Rows that exhausted retries or hit a terminal error and were retained. */
  dead: number;
  /** Message from the most recent failed pass. Cleared by the next success. */
  lastError: string | null;
  /** Epoch ms of the last fully successful pass, or `null` if none yet. */
  lastSyncedAt: number | null;
}

export interface SyncEngineDeps {
  /** Drain the write queue. Resolves to a report; throws on hard failure. */
  push(signal: AbortSignal): Promise<SyncReport>;
  /**
   * Apply remote changes. Resolves to a report, or `null` when there is
   * nothing to pull (no Travel folder configured yet) — which is a normal
   * idle state, not an error.
   */
  pull(signal: AbortSignal): Promise<PullReport | null>;
  /** Live queue depth, split by liveness. */
  counts(): Promise<{ pending: number; dead: number }>;
  /** Injectable for tests. Defaults to `navigator.onLine`. */
  isOnline?(): boolean;
  /** Injectable for tests. Defaults to `document.visibilityState`. */
  isVisible?(): boolean;
  /** Injectable clock. */
  now?(): number;
}

type Listener = (state: SyncState) => void;

export class SyncEngine {
  private readonly deps: SyncEngineDeps;
  private readonly listeners = new Set<Listener>();

  private state: SyncState = {
    phase: 'idle',
    pending: 0,
    dead: 0,
    lastError: null,
    lastSyncedAt: null,
  };

  /** A pass is in flight. */
  private running = false;
  /** A trigger fired while a pass was running; run exactly one more after. */
  private followUp = false;
  private started = false;

  private consecutiveFailures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;

  private readonly onOnline = (): void => {
    // Connectivity is the one signal that justifies discarding accumulated
    // backoff: the reason for every prior failure just changed.
    this.consecutiveFailures = 0;
    this.patch({ phase: 'idle', lastError: null });
    this.wake();
  };
  private readonly onOffline = (): void => this.patch({ phase: 'offline' });
  private readonly onFocus = (): void => this.wake();
  private readonly onVisibility = (): void => {
    if (this.visible()) {
      this.startPolling();
      this.wake();
    } else {
      this.stopPolling();
    }
  };

  constructor(deps: SyncEngineDeps) {
    this.deps = deps;
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.started) return;
    this.started = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('focus', this.onFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }

    if (!this.online()) this.patch({ phase: 'offline' });
    if (this.visible()) this.startPolling();
    void this.refreshCounts();
    this.wake();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('focus', this.onFocus);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }

    this.stopPolling();
    this.clearTimer();
    this.abort?.abort();
    this.abort = null;
  }

  // ---------- observation ----------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): SyncState {
    return this.state;
  }

  // ---------- triggering ----------

  /**
   * Request a pass. Safe to call from anywhere, at any frequency — this is
   * the only entry point, and it is idempotent while a pass is in flight.
   *
   * Never rejects. Callers are fire-and-forget triggers (event handlers, a
   * Dexie hook, a timer); a trigger that could throw would be a trigger that
   * could disable itself.
   */
  wake(): void {
    if (!this.started) return;
    if (!this.online()) {
      this.patch({ phase: 'offline' });
      return;
    }
    if (this.running) {
      this.followUp = true;
      return;
    }
    this.clearTimer();
    void this.runPass();
  }

  private startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => this.wake(), VISIBLE_POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer === null) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleRetry(): void {
    this.clearTimer();
    const delay = backoffMs(this.consecutiveFailures - 1);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.wake();
    }, delay);
  }

  // ---------- the pass ----------

  private async runPass(): Promise<void> {
    this.running = true;
    this.patch({ phase: 'syncing' });

    const controller = new AbortController();
    this.abort = controller;
    const cap = setTimeout(() => controller.abort(), MAX_PASS_MS);

    let failure: string | null = null;
    try {
      // Push first, always. See invariant 2.
      await this.deps.push(controller.signal);
      if (!controller.signal.aborted) {
        await this.deps.pull(controller.signal);
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(cap);
      this.abort = null;
      this.running = false;
    }

    await this.refreshCounts();

    if (failure === null) {
      this.consecutiveFailures = 0;
      this.patch({
        phase: this.online() ? 'idle' : 'offline',
        lastError: null,
        lastSyncedAt: this.clock(),
      });
    } else {
      this.consecutiveFailures += 1;
      // `error` is a *display* state, not a control state — the next tick,
      // focus, or scheduled retry proceeds regardless.
      this.patch({ phase: this.online() ? 'error' : 'offline', lastError: failure });
    }

    if (this.followUp) {
      this.followUp = false;
      // Coalesced trigger: honour it even if this pass failed. It may be the
      // user's own edit waiting to go out.
      this.wake();
      return;
    }
    if (failure !== null) this.scheduleRetry();
  }

  private async refreshCounts(): Promise<void> {
    try {
      const { pending, dead } = await this.deps.counts();
      this.patch({ pending, dead });
    } catch {
      // Counts are cosmetic; a failure to read them must not affect the loop.
    }
  }

  // ---------- helpers ----------

  private online(): boolean {
    if (this.deps.isOnline) return this.deps.isOnline();
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  private visible(): boolean {
    if (this.deps.isVisible) return this.deps.isVisible();
    return typeof document === 'undefined' ? true : document.visibilityState === 'visible';
  }

  private clock(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private patch(next: Partial<SyncState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) fn(this.state);
  }
}
