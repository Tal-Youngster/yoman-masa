import { createContext, type ReactNode } from 'react';
import type { KVStore } from './kv-store';
import type { TripsStore } from './trips-store';
import type { DriveClient } from '@/sync/drive';
import type { WriteQueue } from '@/sync/queue';
import type { SyncReport } from '@/sync/queue';
import type { PullReport } from '@/sync/pull';
import type { AiClient } from '@/lib/ai/client';
import type { ExpensesAdminService } from '@/features/expenses';
import type { TasksAdminService } from '@/features/tasks';
import type { ShoppingAdminService } from '@/features/shopping';

/**
 * Side-effectful trip-creation surface. The trips slice's UI calls this
 * instead of touching Dexie + the write queue directly so the form is easy
 * to test in isolation.
 */
export interface TripsAdminService {
  /** Persist a new trip locally + enqueue the Drive create. Returns the trip. */
  createTrip(input: {
    name: string;
    slug: string;
    start_date: string;
    end_date: string;
    home_currency: string;
    country_codes?: string[];
    notes?: string;
  }): Promise<{ id: string; slug: string }>;
  /** Persist edits locally + enqueue the Drive update. */
  updateTrip(input: {
    id: string;
    name: string;
    home_currency: string;
    start_date: string;
    end_date: string;
    country_codes?: string[];
    notes?: string;
  }): Promise<void>;
  /**
   * Remove the trip locally. Cancels any unsynced writes for it.
   * The Drive markdown file is *not* deleted — the user does that in Obsidian.
   */
  deleteTrip(tripId: string): Promise<void>;
  /** Set the active trip + enqueue the .travel/config.json write. */
  setActiveTrip(tripId: string | null): Promise<void>;
  /** Drain the write queue against Drive. Used by the "Sync now" button. */
  syncNow(): Promise<SyncReport | null>;
}

export interface AppServices {
  kv: KVStore;
  trips: TripsStore;
  /** Trip mutation surface — optional so tests can stub. */
  tripsAdmin?: TripsAdminService;
  /** Drive client (real or fake). Optional because the shell renders without it. */
  drive?: DriveClient;
  /** Persisted write queue. Optional in tests. */
  writeQueue?: WriteQueue;
  /** Generic AI extraction client. Optional. */
  ai?: AiClient;
  /** Expenses mutation surface (S7). Optional so tests can stub. */
  expensesAdmin?: ExpensesAdminService;
  /** Tasks mutation surface (S10). Optional so tests can stub. */
  tasksAdmin?: TasksAdminService;
  /** Shopping mutation surface (S11). Optional so tests can stub. */
  shoppingAdmin?: ShoppingAdminService;
  /**
   * Inbound Drive → Dexie sync (ADR-0014). Resolves the configured Travel
   * folder, runs `pullAll` against the inbound registry, and returns the
   * report. Returns `null` if no folder is configured or sync is unavailable.
   * Optional so tests + shells without a real Drive can render.
   */
  pullDriveInbound?: () => Promise<PullReport | null>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}): React.JSX.Element {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}
