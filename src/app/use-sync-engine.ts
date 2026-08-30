/**
 * React binding for the {@link SyncEngine} (ADR-0019).
 *
 * `useSyncEngine` starts the engine for the lifetime of the shell.
 * `useSyncState` subscribes a component to its state. Neither exposes a way
 * to *initiate* sync — that is the entire point of ADR-0019, and adding one
 * would reintroduce the button the engine exists to delete.
 */

import { useEffect, useSyncExternalStore } from 'react';

import type { SyncState } from '@/sync/engine';

import { useAppServices } from './use-app-services';

const IDLE: SyncState = {
  phase: 'idle',
  pending: 0,
  dead: 0,
  lastError: null,
  lastSyncedAt: null,
};

/** Start/stop the engine. Call once, from the shell. */
export function useSyncEngine(): void {
  const { sync } = useAppServices();

  useEffect(() => {
    if (!sync) return;
    sync.start();
    return () => sync.stop();
  }, [sync]);
}

/** Subscribe to engine state. Safe when no engine is wired (tests, shells). */
export function useSyncState(): SyncState {
  const { sync } = useAppServices();

  return useSyncExternalStore(
    (onChange) => {
      if (!sync) return () => undefined;
      // `subscribe` invokes the listener immediately with current state, which
      // is exactly the "emit on subscribe" contract useSyncExternalStore wants.
      return sync.subscribe(onChange);
    },
    () => sync?.getState() ?? IDLE,
    () => IDLE,
  );
}
