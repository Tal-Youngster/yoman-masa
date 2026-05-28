/**
 * Inbound reconciler registry. Parallel to `@/sync/queue`'s outbound
 * `ReconcilerRegistry` but matches on path instead of entityType discriminator
 * — the pull worker receives a Drive file and has to figure out which slice
 * owns it, which only the slice itself knows (via the path convention from
 * its `paths.ts`).
 *
 * First-match wins. Slices register patterns mutually exclusive enough that
 * registration order doesn't matter; the worker validates this isn't being
 * leaned on by surfacing duplicate-entityType registration as a hard error.
 */

import type { EntityType } from '@/lib/storage';

import type { InboundReconciler } from './types.js';

export class InboundReconcilerRegistry {
  private readonly byType = new Map<EntityType, InboundReconciler>();

  register(r: InboundReconciler): void {
    if (this.byType.has(r.entityType)) {
      throw new Error(`Inbound reconciler already registered for "${r.entityType}"`);
    }
    this.byType.set(r.entityType, r);
  }

  /** Replace an existing entry. Tests use this to swap in stubs. */
  override(r: InboundReconciler): void {
    this.byType.set(r.entityType, r);
  }

  unregister(entityType: EntityType): void {
    this.byType.delete(entityType);
  }

  has(entityType: EntityType): boolean {
    return this.byType.has(entityType);
  }

  get(entityType: EntityType): InboundReconciler | null {
    return this.byType.get(entityType) ?? null;
  }

  /** First reconciler whose `matchesPath` returns true. `null` if none match. */
  match(relPath: string): InboundReconciler | null {
    for (const r of this.byType.values()) {
      if (r.matchesPath(relPath)) return r;
    }
    return null;
  }

  /** All registered reconcilers (insertion order). Used by tests + diagnostics. */
  list(): readonly InboundReconciler[] {
    return [...this.byType.values()];
  }
}

/** Default singleton used by the pull worker. Slices register on this in their
 *  `register*` entrypoint, same pattern as the outbound registry. */
export const inboundReconcilers: InboundReconcilerRegistry = new InboundReconcilerRegistry();
