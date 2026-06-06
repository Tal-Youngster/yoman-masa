import {
  inboundReconcilers as defaultInboundRegistry,
  type InboundReconcilerRegistry,
} from '@/sync/pull';
import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { taskInboundReconciler } from './inbound';
import { taskReconciler } from './reconciler';

export function registerTaskReconcilers(
  registry: ReconcilerRegistry = defaultRegistry,
  inboundRegistry: InboundReconcilerRegistry = defaultInboundRegistry,
): void {
  if (!registry.has(taskReconciler.entityType)) {
    registry.register(taskReconciler);
  }
  if (!inboundRegistry.has(taskInboundReconciler.entityType)) {
    inboundRegistry.register(taskInboundReconciler);
  }
}
