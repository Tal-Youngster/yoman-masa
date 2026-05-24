import { tripFolderPath } from '@/features/trips/paths';

/**
 * Tasks file path (ADR-0004 / ADR-0010):
 *   per trip:  <travelFolder>/Trips/<slug>/Tasks.md
 *   General:   <travelFolder>/General/Tasks.md
 *
 * Pass `null` for `tripSlug` to address the cross-trip General list.
 */
export function tasksFilePath(travelFolderPath: string, tripSlug: string | null): string {
  if (tripSlug === null) {
    return `${stripTrailingSlash(travelFolderPath)}/General/Tasks.md`;
  }
  return `${tripFolderPath(travelFolderPath, tripSlug)}/Tasks.md`;
}

/** Block reference for a task line: `t-<ulid>` (no leading caret). */
export function taskBlockRef(taskId: string): string {
  return `t-${taskId.replace(/^tsk_/, '')}`;
}

function stripTrailingSlash(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p;
}
