/**
 * Wiring between the expenses UI and the persistence + sync + FX layers.
 *
 * Each add/edit:
 *  1. Refreshes (or fetches) the FX snapshot for the trip's home currency,
 *     unless an expense is already in the home currency.
 *  2. Computes a `home_conversion` snapshot at entry time (ADR-0008 — never
 *     compute conversions during render).
 *  3. Upserts the expense in Dexie.
 *  4. Enqueues a line-level write against the monthly ledger file.
 *
 * Rate-snapshot persistence (the `<vault>/.travel/rates/<date>.json` files)
 * is enqueued through the rates_snapshot reconciler once per refresh.
 */

import { ulid } from 'ulid';
import { z } from 'zod';
import { Expense, ExpenseCategory } from '@/domain/expense';
import { newExpenseId } from '@/domain/ids';
import type { ExpenseId, TripId } from '@/domain/ids';
import { IsoDate } from '@/domain/dates';
import { Currency, type Currency as CurrencyT } from '@/domain/money';
import {
  refreshRates,
  ratesFilePath,
  convert,
  type RatesPayload,
} from '@/lib/currency';
import type { TravelDB } from '@/lib/storage';
import { upsertExpense, getExpense, deleteExpense, listExpensesByTrip } from './queries';
import type { ExpensePayload } from './reconciler';
import { expensesLedgerPath, ledgerMonthForDate } from './paths';
import type { WriteQueue } from '@/sync/queue';
import type { Trip } from '@/domain/trip';

const AddInput = z.object({
  trip_id: z.string(),
  date: IsoDate,
  amount: z.number().positive(),
  currency: Currency,
  category: ExpenseCategory,
  description: z.string().default(''),
  location: z.string().optional(),
});

export type AddExpenseInput = z.input<typeof AddInput>;

export interface ExpensesAdminDeps {
  db?: TravelDB;
  writeQueue: WriteQueue;
  /** Vault path of the Travel folder, used to resolve ledger + rates paths. */
  travelFolderPath: string;
  /** `yyyy-mm-dd` today, in UTC. Tests inject; production passes the real value. */
  today: () => string;
}

export interface ExpensesAdminService {
  /** Create a new expense; computes home_conversion snapshot if needed. */
  addExpense(trip: Trip, input: AddExpenseInput): Promise<Expense>;
  /** Update an existing expense (keeps id; recomputes snapshot if amount/currency changed). */
  updateExpense(trip: Trip, expense: Expense): Promise<void>;
  /** Delete an expense locally + enqueue the line removal. */
  removeExpense(trip: Trip, expense: Expense): Promise<void>;
  /**
   * Convenience read used by routes — listExpensesByTrip with no extra
   * processing. Exists on the service so tests stub a single surface.
   */
  listByTrip(tripId: TripId): Promise<Expense[]>;
  /**
   * Refresh and persist the rates snapshot for `base` if today's snapshot
   * isn't already cached. Returns the resulting snapshot (cached or fresh).
   * Safe to call eagerly on app focus or before form open.
   */
  primeRates(base: CurrencyT): Promise<{ date: string; source: 'frankfurter' | 'fallback' }>;
}

export function createExpensesAdmin(deps: ExpensesAdminDeps): ExpensesAdminService {
  async function enqueueLedgerWrite(
    trip: Trip,
    expense: Expense,
    op: 'create' | 'update' | 'delete',
  ): Promise<void> {
    const month = ledgerMonthForDate(expense.date);
    const payload: ExpensePayload = { expense, month };
    const path = expensesLedgerPath(deps.travelFolderPath, trip.slug, month);
    await deps.writeQueue.enqueue({
      id: ulid(),
      entityType: 'expense',
      entityId: expense.id,
      op,
      payload,
      baseRevision: null,
      fileId: null,
      resolvedPath: path,
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
  }

  async function ensureSnapshot(trip: Trip, native: { amount: number; currency: CurrencyT; date: IsoDate }) {
    if (native.currency === trip.home_currency) return undefined;
    const snapshot = await refreshRates(trip.home_currency, {
      today: deps.today(),
      ...(deps.db ? { db: deps.db } : {}),
    });
    const converted = convert({
      amount: native.amount,
      from: native.currency,
      to: trip.home_currency,
      snapshot,
    });
    // Enqueue the snapshot file write side-by-side with the expense write so
    // remote clients see today's rates. Idempotent: dexie + reconciler treat
    // it as last-write-wins.
    const payload: RatesPayload = { snapshot };
    const path = ratesFilePath(deps.travelFolderPath, snapshot.date);
    await deps.writeQueue.enqueue({
      id: ulid(),
      entityType: 'rates_snapshot',
      entityId: snapshot.date,
      op: 'create',
      payload,
      baseRevision: null,
      fileId: null,
      resolvedPath: path,
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
    return converted ?? undefined;
  }

  return {
    async addExpense(trip, input): Promise<Expense> {
      const fields = AddInput.parse(input);
      const id = newExpenseId();
      const conversion = await ensureSnapshot(trip, {
        amount: fields.amount,
        currency: fields.currency,
        date: fields.date,
      });
      const expense = Expense.parse({
        type: 'expense',
        id,
        trip_id: fields.trip_id as TripId,
        date: fields.date,
        amount: fields.amount,
        currency: fields.currency,
        category: fields.category,
        description: fields.description,
        ...(fields.location !== undefined ? { location: fields.location } : {}),
        ...(conversion ? { home_conversion: conversion } : {}),
      });
      await upsertExpense(expense, deps.db);
      await enqueueLedgerWrite(trip, expense, 'create');
      return expense;
    },

    async updateExpense(trip, expense): Promise<void> {
      const existing = await getExpense(expense.id, deps.db);
      const recompute = !existing || existing.amount !== expense.amount || existing.currency !== expense.currency;
      let updated: Expense = expense;
      if (recompute) {
        const conversion = await ensureSnapshot(trip, {
          amount: expense.amount,
          currency: expense.currency,
          date: expense.date,
        });
        updated = Expense.parse({
          ...expense,
          ...(conversion ? { home_conversion: conversion } : {}),
        });
      }
      await upsertExpense(updated, deps.db);
      await enqueueLedgerWrite(trip, updated, 'update');
    },

    async removeExpense(trip, expense): Promise<void> {
      await deleteExpense(expense.id, deps.db);
      await enqueueLedgerWrite(trip, expense, 'delete');
    },

    async listByTrip(tripId: TripId): Promise<Expense[]> {
      return listExpensesByTrip(tripId, deps.db);
    },

    async primeRates(base: CurrencyT) {
      const snap = await refreshRates(base, {
        today: deps.today(),
        ...(deps.db ? { db: deps.db } : {}),
      });
      return { date: snap.date, source: snap.source };
    },
  };
}

/** Re-export so callers don't reach across feature boundaries for the type. */
export type { Expense, ExpenseId };
