/**
 * Integration: the full S3 read → write → re-read → reapply path for the
 * line-level expenses reconciler against the in-memory FakeDrive.
 *
 * What's exercised:
 *  - First-write-of-month creates a ledger file with frontmatter + one line.
 *  - Second write into the same month appends a second line without touching
 *    the first.
 *  - Mid-flight external edit (a comment line) survives our write — the line
 *    primitives only touch the targeted block ref.
 */

import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';

import { FakeDrive } from '@/sync/drive/fake';
import {
  ReconcilerRegistry,
  drainAll,
  MemoryWriteQueue,
  type WriteQueueItem,
} from '@/sync/queue';

import { TripId, ExpenseId } from '@/domain/ids';
import { Currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { Expense, ExpenseCategory } from '@/domain/expense';

import { expenseReconciler, type ExpensePayload } from './reconciler';
import { expensesLedgerPath } from './paths';
import { parseExpensesLedger } from './parser';
import { serializeExpensesLedger } from './serializer';

const TRIP_ID = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');
const TRIP_SLUG = 'kyoto-2026';
const TRAVEL_FOLDER = 'MyVault/Travel';

function makeExpense(suffix: string, overrides: Partial<Expense> = {}): Expense {
  return Expense.parse({
    type: 'expense',
    id: ExpenseId.parse(`exp_01HABCDEFGHJKMNPQRSTVWXY${suffix}`),
    trip_id: TRIP_ID,
    date: IsoDate.parse('2026-05-04'),
    amount: 12.4,
    currency: Currency.parse('EUR'),
    category: ExpenseCategory.parse('food'),
    description: 'Café in Lisbon',
    ...overrides,
  });
}

function makeItem(
  expense: Expense,
  overrides: Partial<WriteQueueItem<ExpensePayload>> = {},
): WriteQueueItem<ExpensePayload> {
  return {
    id: ulid(),
    entityType: 'expense',
    entityId: expense.id,
    op: 'create',
    payload: { expense, month: expense.date.slice(0, 7) },
    baseRevision: null,
    fileId: null,
    resolvedPath: expensesLedgerPath(TRAVEL_FOLDER, TRIP_SLUG, expense.date.slice(0, 7)),
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('expenses integration — FakeDrive + worker', () => {
  it('creates a new monthly ledger on first write', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(expenseReconciler);

    // Folder hierarchy the path resolves through.
    const tripsId = drive.seedFolder({
      name: 'Trips',
      parents: [drive.travelFolderId],
      path: `${TRAVEL_FOLDER}/Trips`,
    });
    const slugId = drive.seedFolder({
      name: TRIP_SLUG,
      parents: [tripsId],
      path: `${TRAVEL_FOLDER}/Trips/${TRIP_SLUG}`,
    });
    const monthFolderId = drive.seedFolder({
      name: 'Expenses',
      parents: [slugId],
      path: `${TRAVEL_FOLDER}/Trips/${TRIP_SLUG}/Expenses`,
    });

    const expense = makeExpense('01');
    await queue.enqueue(makeItem(expense));

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      resolveParent: () => Promise.resolve(monthFolderId),
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report.applied).toBe(1);

    const children = await drive.listFolder(monthFolderId);
    const created = children.find((c) => c.name === '2026-05.md');
    expect(created).toBeDefined();
    if (!created) throw new Error('unreachable');
    const { content } = await drive.getContent(created.id);
    const parsed = parseExpensesLedger(content);
    expect(parsed.expenses).toHaveLength(1);
    expect(parsed.expenses[0].id).toBe(expense.id);
  });

  it('appends a second line to an existing ledger without disturbing the first', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(expenseReconciler);

    const slugId = drive.seedFolder({
      name: TRIP_SLUG,
      parents: [drive.travelFolderId],
      path: `${TRAVEL_FOLDER}/Trips/${TRIP_SLUG}`,
    });
    const monthFolderId = drive.seedFolder({
      name: 'Expenses',
      parents: [slugId],
      path: `${TRAVEL_FOLDER}/Trips/${TRIP_SLUG}/Expenses`,
    });
    const filePath = expensesLedgerPath(TRAVEL_FOLDER, TRIP_SLUG, '2026-05');
    const seeded = serializeExpensesLedger({
      tripId: TRIP_ID,
      month: '2026-05',
      expenses: [makeExpense('01', { description: 'first' })],
    });
    const fileId = drive.seedFile({
      name: '2026-05.md',
      parent: monthFolderId,
      path: filePath,
      content: seeded,
    });
    const base = (await drive.getMetadata(fileId)).headRevisionId;

    const second = makeExpense('02', { description: 'second', amount: 5 });
    await queue.enqueue(
      makeItem(second, {
        op: 'update',
        fileId,
        baseRevision: base,
      }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report.applied).toBe(1);

    const { content } = await drive.getContent(fileId);
    const parsed = parseExpensesLedger(content);
    expect(parsed.expenses).toHaveLength(2);
    const ids = parsed.expenses.map((e) => e.id).sort();
    expect(ids).toEqual(
      [
        ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXY01'),
        ExpenseId.parse('exp_01HABCDEFGHJKMNPQRSTVWXY02'),
      ].sort(),
    );
  });

  it('mid-flight conflict: external comment line survives our line-level write', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(expenseReconciler);

    const slugId = drive.seedFolder({
      name: TRIP_SLUG,
      parents: [drive.travelFolderId],
      path: `${TRAVEL_FOLDER}/Trips/${TRIP_SLUG}`,
    });
    const monthFolderId = drive.seedFolder({
      name: 'Expenses',
      parents: [slugId],
      path: `${TRAVEL_FOLDER}/Trips/${TRIP_SLUG}/Expenses`,
    });
    const filePath = expensesLedgerPath(TRAVEL_FOLDER, TRIP_SLUG, '2026-05');
    const seeded = serializeExpensesLedger({
      tripId: TRIP_ID,
      month: '2026-05',
      expenses: [makeExpense('01', { description: 'first' })],
    });
    const fileId = drive.seedFile({
      name: '2026-05.md',
      parent: monthFolderId,
      path: filePath,
      content: seeded,
    });
    const base = (await drive.getMetadata(fileId)).headRevisionId;

    // Sneak an Obsidian-edited version (with a free comment line) before our
    // worker drains. The reconciler should re-fetch, see the new revision,
    // reapply our `insertLine` against the fresh body, and write — keeping the
    // comment intact.
    const withComment = seeded.replace(/\n*$/, '\n<!-- Obsidian note -->\n');
    drive.externalEdit(fileId, withComment);

    const second = makeExpense('02', { description: 'second', amount: 5 });
    await queue.enqueue(
      makeItem(second, {
        op: 'update',
        fileId,
        baseRevision: base,
      }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report.applied).toBe(1);

    const { content } = await drive.getContent(fileId);
    expect(content).toContain('<!-- Obsidian note -->');
    const parsed = parseExpensesLedger(content);
    expect(parsed.expenses).toHaveLength(2);
  });
});
