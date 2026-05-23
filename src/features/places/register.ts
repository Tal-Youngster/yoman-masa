import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';
import { placeReconciler } from './reconciler';

export function registerPlaceReconcilers(registry: ReconcilerRegistry = defaultRegistry): void {
  if (!registry.has(placeReconciler.entityType)) {
    registry.register(placeReconciler);
  }
}
