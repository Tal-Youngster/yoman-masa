/**
 * Register the trip reconcilers — outbound + inbound — with their respective
 * registries (defaults: the global singletons in `@/sync/queue` and
 * `@/sync/pull`). The app entrypoint calls this once during boot.
 *
 * Idempotent — calling twice is a no-op (re-registration of the same
 * entityType throws, so we check first).
 */

import {
  inboundReconcilers as defaultInboundRegistry,
  type InboundReconcilerRegistry,
} from '@/sync/pull';
import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { activeConfigReconciler } from './active-config';
import { tripInboundReconciler } from './inbound';
import { tripReconciler } from './reconciler';

export function registerTripReconcilers(
  registry: ReconcilerRegistry = defaultRegistry,
  inboundRegistry: InboundReconcilerRegistry = defaultInboundRegistry,
): void {
  if (!registry.has(tripReconciler.entityType)) {
    registry.register(tripReconciler);
  }
  if (!registry.has(activeConfigReconciler.entityType)) {
    registry.register(activeConfigReconciler);
  }
  if (!inboundRegistry.has(tripInboundReconciler.entityType)) {
    inboundRegistry.register(tripInboundReconciler);
  }
}
