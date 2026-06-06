import {
  inboundReconcilers as defaultInboundRegistry,
  type InboundReconcilerRegistry,
} from '@/sync/pull';
import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { shoppingInboundReconciler } from './inbound';
import { shoppingItemReconciler } from './reconciler';

export function registerShoppingReconcilers(
  registry: ReconcilerRegistry = defaultRegistry,
  inboundRegistry: InboundReconcilerRegistry = defaultInboundRegistry,
): void {
  if (!registry.has(shoppingItemReconciler.entityType)) {
    registry.register(shoppingItemReconciler);
  }
  if (!inboundRegistry.has(shoppingInboundReconciler.entityType)) {
    inboundRegistry.register(shoppingInboundReconciler);
  }
}
