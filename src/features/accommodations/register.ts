import {
  inboundReconcilers as defaultInboundRegistry,
  type InboundReconcilerRegistry,
} from '@/sync/pull';
import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { accommodationInboundReconciler } from './inbound';
import { accommodationReconciler } from './reconciler';

export function registerAccommodationReconcilers(
  registry: ReconcilerRegistry = defaultRegistry,
  inboundRegistry: InboundReconcilerRegistry = defaultInboundRegistry,
): void {
  if (!registry.has(accommodationReconciler.entityType)) {
    registry.register(accommodationReconciler);
  }
  if (!inboundRegistry.has(accommodationInboundReconciler.entityType)) {
    inboundRegistry.register(accommodationInboundReconciler);
  }
}
