import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';
import { accommodationReconciler } from './reconciler';

export function registerAccommodationReconcilers(registry: ReconcilerRegistry = defaultRegistry): void {
  if (!registry.has(accommodationReconciler.entityType)) {
    registry.register(accommodationReconciler);
  }
}
