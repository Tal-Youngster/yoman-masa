import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';
import { ratesReconciler } from '@/lib/currency';
import { expenseReconciler } from './reconciler';

export function registerExpenseReconcilers(registry: ReconcilerRegistry = defaultRegistry): void {
  if (!registry.has(expenseReconciler.entityType)) {
    registry.register(expenseReconciler);
  }
  if (!registry.has(ratesReconciler.entityType)) {
    registry.register(ratesReconciler);
  }
}
