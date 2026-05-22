/**
 * Reconciler registry.
 *
 * Feature slices register one reconciler per entity type. The worker picks
 * the reconciler by `entityType` discriminant when draining the queue.
 *
 * The reconciler API is intentionally small:
 *  - `fromMarkdown(content)`: parse a file into a typed entity.
 *  - `toMarkdown(entity, originalContent | null)`: serialize, preserving body
 *    when an original exists (per ADR-0006 round-trip invariant).
 *  - `applyEdit(originalContent, payload)`: surgical patch on the fresh file
 *    content. Throws `EditPointMissingError` if the structured edit point
 *    (entity id in frontmatter, line block-ref) no longer exists. The worker
 *    surfaces that as a "needs attention" item per ADR-0006.
 */

import type { WriteQueueItem } from './types.js';

/**
 * `Payload` is supplied by the feature slice. The worker treats reconcilers as
 * opaque adapters keyed by `entityType`. The shape of `Payload` is the
 * reconciler's concern.
 */
export interface Reconciler<Entity, Payload = unknown> {
  /** Discriminant matched against `WriteQueueItem.entityType`. */
  readonly entityType: string;
  /** Parse a markdown file into the entity, or `null` if the content isn't recognized. */
  fromMarkdown(content: string): Entity | null;
  /**
   * Serialize the entity to markdown. When `originalContent` is provided (the
   * common case for updates), the implementation should preserve the body
   * verbatim and only rewrite the frontmatter / line being edited.
   */
  toMarkdown(entity: Entity, originalContent: string | null): string;
  /**
   * Surgically apply a queued edit on top of fresh file content. Used during
   * conflict reconciliation. Must throw `EditPointMissingError` if the edit
   * point disappeared.
   */
  applyEdit(originalContent: string, item: WriteQueueItem<Payload>): string;
}

/** A registry implementation. Maps `entityType` → reconciler. */
export class ReconcilerRegistry {
  private readonly map = new Map<string, Reconciler<unknown, unknown>>();

  register<E, P>(r: Reconciler<E, P>): void {
    if (this.map.has(r.entityType)) {
      throw new Error(`Reconciler already registered for entityType "${r.entityType}"`);
    }
    this.map.set(r.entityType, r);
  }

  /** Replace an existing reconciler. Tests use this to swap in stubs. */
  override<E, P>(r: Reconciler<E, P>): void {
    this.map.set(r.entityType, r);
  }

  unregister(entityType: string): void {
    this.map.delete(entityType);
  }

  has(entityType: string): boolean {
    return this.map.has(entityType);
  }

  /** Lookup; returns `null` if no reconciler is registered. */
  get(entityType: string): Reconciler<unknown, unknown> | null {
    return this.map.get(entityType) ?? null;
  }
}

/** Default singleton used by the worker. Feature slices import and register on this. */
export const reconcilers: ReconcilerRegistry = new ReconcilerRegistry();
