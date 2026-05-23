/**
 * Register the trip reconcilers with the supplied ReconcilerRegistry (default:
 * the global singleton in `@/sync/queue`). The app entrypoint calls this once
 * during boot.
 *
 * Idempotent — calling twice is a no-op (re-registration of the same
 * entityType throws, so we check first).
 */

import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { activeConfigReconciler } from './active-config';
import { tripReconciler } from './reconciler';

export function registerTripReconcilers(registry: ReconcilerRegistry = defaultRegistry): void {
  if (!registry.has(tripReconciler.entityType)) {
    registry.register(tripReconciler);
  }
  if (!registry.has(activeConfigReconciler.entityType)) {
    registry.register(activeConfigReconciler);
  }
}
