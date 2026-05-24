/**
 * Tasks reconciler — line-level patching via S1 primitives.
 *
 * Like expenses (and unlike file-per-entity trips/accommodations), one task is
 * one line in a per-trip (or General) `Tasks.md`. `applyEdit` finds the line by
 * its `^t-<ulid>` block ref and inserts/replaces/removes it without disturbing
 * the rest of the file — headings, notes, and other tasks the user keeps there.
 *
 * On the first write to a file that doesn't exist yet, the worker passes empty
 * `originalContent`; we emit minimal frontmatter plus the single line.
 *
 * Edits preserve the *existing* line's indentation (a task nested under another
 * in Obsidian stays nested) — we don't model nesting, just leave it verbatim.
 */

import { z } from 'zod';
import {
  parseFrontmatter,
  serializeFrontmatter,
  findLineByBlockRef,
  replaceLine,
  insertLine,
  removeLine,
} from '@/lib/markdown';
import type { Reconciler, WriteQueueItem } from '@/sync/queue';
import { Task } from '@/domain/task';
import { parseTasksFile } from './parser';
import { serializeTaskLine, serializeTasksFile } from './serializer';
import { taskBlockRef } from './paths';

export interface TaskPayload {
  task: Task;
}

const TaskPayloadSchema = z.object({ task: Task });

function leadingWhitespace(line: string): string {
  return /^(\s*)/.exec(line)?.[1] ?? '';
}

export const taskReconciler: Reconciler<Task, TaskPayload> = {
  entityType: 'task',

  fromMarkdown(content: string): Task | null {
    try {
      return parseTasksFile(content).tasks[0] ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Not the primary path (an entity-as-file rewrite would drop sibling lines).
   * Returns the original content if parseable, else a single-task file.
   */
  toMarkdown(entity: Task, originalContent: string | null): string {
    if (originalContent === null || originalContent === '') {
      return serializeTasksFile({ tripId: entity.trip_id, tasks: [entity] });
    }
    return originalContent;
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const { task } = TaskPayloadSchema.parse(item.payload);
    const blockRef = taskBlockRef(task.id);

    if (originalContent === '') {
      if (item.op === 'delete') return '';
      return serializeTasksFile({ tripId: task.trip_id, tasks: [task] });
    }

    const parsed = parseFrontmatter(originalContent);
    const body = parsed.body;
    const existing = findLineByBlockRef(body, blockRef);

    let nextBody: string;
    if (item.op === 'delete') {
      if (!existing) return originalContent;
      nextBody = removeLine(body, blockRef);
    } else if (existing) {
      nextBody = replaceLine(body, blockRef, serializeTaskLine(task, leadingWhitespace(existing.line)));
    } else {
      nextBody = insertLine(body, serializeTaskLine(task));
    }

    return serializeFrontmatter(parsed.frontmatter, nextBody, { lineEnding: parsed.lineEnding });
  },
};
