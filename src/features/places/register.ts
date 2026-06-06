import {
  inboundReconcilers as defaultInboundRegistry,
  type InboundReconcilerRegistry,
} from '@/sync/pull';
import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { placeInboundReconciler } from './inbound';
import { placeReconciler } from './reconciler';

export function registerPlaceReconcilers(
  registry: ReconcilerRegistry = defaultRegistry,
  inboundRegistry: InboundReconcilerRegistry = defaultInboundRegistry,
): void {
  if (!registry.has(placeReconciler.entityType)) {
    registry.register(placeReconciler);
  }
  if (!inboundRegistry.has(placeInboundReconciler.entityType)) {
    inboundRegistry.register(placeInboundReconciler);
  }
}
