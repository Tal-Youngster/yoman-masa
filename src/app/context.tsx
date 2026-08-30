import { createContext, type ReactNode } from 'react';
import type { KVStore } from './kv-store';
import type { TripsStore } from './trips-store';
import type { DriveClient } from '@/sync/drive';
import type { WriteQueue } from '@/sync/queue';
import type { SyncEngine } from '@/sync/engine';
import type { AiClient } from '@/lib/ai/client';
import type { GmailClient } from '@/lib/gmail';
import type { TasksAdminService } from '@/features/tasks';
import type { ShoppingAdminService } from '@/features/shopping';
import type { ArticlesAdminService } from '@/features/articles';

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
  /** Read-only Gmail client (ADR-0016). Present only with real Drive auth. */
  gmail?: GmailClient;
  /** Tasks mutation surface (S10). Optional so tests can stub. */
  tasksAdmin?: TasksAdminService;
  /** Shopping mutation surface (S11). Optional so tests can stub. */
  shoppingAdmin?: ShoppingAdminService;
  /** Articles mutation surface (S12). Optional so tests can stub. */
  articlesAdmin?: ArticlesAdminService;
  /**
   * Continuous sync engine (ADR-0019). Owns every push/pull trigger; the UI
   * only observes it. There is deliberately no imperative "sync now" surface
   * — enqueueing a write is itself the trigger. Optional so tests and shells
   * without a real Drive can render.
   */
  sync?: SyncEngine;
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
