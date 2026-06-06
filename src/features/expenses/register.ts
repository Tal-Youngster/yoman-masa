import { ratesReconciler } from '@/lib/currency';
import {
  inboundReconcilers as defaultInboundRegistry,
  type InboundReconcilerRegistry,
} from '@/sync/pull';
import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { expenseInboundReconciler } from './inbound';
import { expenseReconciler } from './reconciler';

export function registerExpenseReconcilers(
  registry: ReconcilerRegistry = defaultRegistry,
  inboundRegistry: InboundReconcilerRegistry = defaultInboundRegistry,
): void {
  if (!registry.has(expenseReconciler.entityType)) {
    registry.register(expenseReconciler);
  }
  if (!registry.has(ratesReconciler.entityType)) {
    registry.register(ratesReconciler);
  }
  if (!inboundRegistry.has(expenseInboundReconciler.entityType)) {
    inboundRegistry.register(expenseInboundReconciler);
  }
}
