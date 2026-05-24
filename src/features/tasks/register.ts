import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';
import { taskReconciler } from './reconciler';

export function registerTaskReconcilers(registry: ReconcilerRegistry = defaultRegistry): void {
  if (!registry.has(taskReconciler.entityType)) {
    registry.register(taskReconciler);
  }
}
