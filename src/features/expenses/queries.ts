import type { TravelDB } from '@/lib/storage';
import {
  upsertExpense as dbUpsert,
  getExpense as dbGet,
  deleteExpense as dbDelete,
  expensesByTrip as dbListByTrip,
  expensesByTripAndMonth as dbListByMonth,
} from '@/lib/storage/queries';
import type { Expense } from '@/domain/expense';
import type { TripId } from '@/domain/ids';

export async function listExpensesByTrip(tripId: TripId, db?: TravelDB): Promise<Expense[]> {
  const xs = await dbListByTrip(tripId, db);
  return xs.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });
}

export async function listExpensesByMonth(
  tripId: TripId,
  yyyy_mm: string,
  db?: TravelDB,
): Promise<Expense[]> {
  const xs = await dbListByMonth(tripId, yyyy_mm, db);
  return xs.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });
}

export async function upsertExpense(expense: Expense, db?: TravelDB): Promise<void> {
  await dbUpsert(expense, db);
}

export async function getExpense(id: Expense['id'], db?: TravelDB): Promise<Expense | undefined> {
  return dbGet(id, db);
}

export async function deleteExpense(id: Expense['id'], db?: TravelDB): Promise<void> {
  await dbDelete(id, db);
}
