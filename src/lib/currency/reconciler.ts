import type { Reconciler, WriteQueueItem } from '@/sync/queue';
import { RatesSnapshot } from './types';

/**
 * Rates snapshots are per-day, write-only generated files — no user content
 * lives below the frontmatter. Conflict reconciliation is effectively last-
 * write-wins because two clients fetching ECB rates on the same UTC day
 * should produce structurally identical content.
 *
 * The payload IS the snapshot. We serialize as pretty JSON so the file is
 * legible if the user opens it in Obsidian.
 */
export interface RatesPayload {
  snapshot: RatesSnapshot;
}

export const ratesReconciler: Reconciler<RatesSnapshot, RatesPayload> = {
  entityType: 'rates_snapshot',

  fromMarkdown(content: string): RatesSnapshot | null {
    try {
      const obj = JSON.parse(content) as unknown;
      const parsed = RatesSnapshot.safeParse(obj);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },

  toMarkdown(entity: RatesSnapshot): string {
    return `${JSON.stringify(entity, null, 2)}\n`;
  },

  applyEdit(_originalContent: string, item: WriteQueueItem<unknown>): string {
    const payload = item.payload as RatesPayload;
    return `${JSON.stringify(payload.snapshot, null, 2)}\n`;
  },
};
