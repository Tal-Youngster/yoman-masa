import {
  inboundReconcilers as defaultInboundRegistry,
  type InboundReconcilerRegistry,
} from '@/sync/pull';
import { reconcilers as defaultRegistry, type ReconcilerRegistry } from '@/sync/queue';

import { articleInboundReconciler } from './inbound';
import { articleReconciler } from './reconciler';

export function registerArticleReconcilers(
  registry: ReconcilerRegistry = defaultRegistry,
  inboundRegistry: InboundReconcilerRegistry = defaultInboundRegistry,
): void {
  if (!registry.has(articleReconciler.entityType)) {
    registry.register(articleReconciler);
  }
  if (!inboundRegistry.has(articleInboundReconciler.entityType)) {
    inboundRegistry.register(articleInboundReconciler);
  }
}
