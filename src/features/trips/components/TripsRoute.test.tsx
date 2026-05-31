// @vitest-environment jsdom
import 'fake-indexeddb/auto';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppServicesProvider, type AppServices, type TripsAdminService } from '@/app/context';
import { createMemoryKVStore } from '@/app/kv-store';
import { createMockTripsStore } from '@/app/trips-store';
import { asFileId, DriveApiError } from '@/sync/drive';
import type { FileMetadata } from '@/sync/drive';
import type { Trip } from '@/domain';
import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';
import { newTrip } from '@/domain/trip';
import { upsertTrip, type TravelDB } from '@/lib/storage';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';

import * as tripsQueries from '../queries';
import { TripsRoute } from './TripsRoute';

// Capture the un-spied implementation at module load. Each test's spy delegates
// to this — re-reading `tripsQueries.listTripsAll` inside renderRoute would
// capture the previous test's spy and recurse.
const ORIGINAL_LIST_TRIPS_ALL = tripsQueries.listTripsAll;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(): void {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(): void {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

interface HarnessOptions {
  travelFolderId?: string | null;
  activeTripId?: string | null;
  seedTrips?: Trip[];
  tripsAdmin?: Partial<TripsAdminService>;
  drivePickFolder?: () => Promise<{ id: string; name: string; path: string }>;
  driveGetMetadata?: () => Promise<FileMetadata>;
}

function makeAdminStub(overrides: Partial<TripsAdminService> = {}): TripsAdminService & {
  calls: {
    createTrip: Array<Parameters<TripsAdminService['createTrip']>[0]>;
    updateTrip: Array<Parameters<TripsAdminService['updateTrip']>[0]>;
    deleteTrip: Array<Parameters<TripsAdminService['deleteTrip']>[0]>;
    setActiveTrip: Array<Parameters<TripsAdminService['setActiveTrip']>[0]>;
    syncNow: number;
  };
} {
  const calls = {
    createTrip: [] as Array<Parameters<TripsAdminService['createTrip']>[0]>,
    updateTrip: [] as Array<Parameters<TripsAdminService['updateTrip']>[0]>,
    deleteTrip: [] as Array<Parameters<TripsAdminService['deleteTrip']>[0]>,
    setActiveTrip: [] as Array<Parameters<TripsAdminService['setActiveTrip']>[0]>,
    syncNow: 0,
  };
  return {
    createTrip:
      overrides.createTrip ??
      ((input) => {
        calls.createTrip.push(input);
        return Promise.resolve({ id: 'trp_stub', slug: input.slug });
      }),
    updateTrip:
      overrides.updateTrip ??
      ((input) => {
        calls.updateTrip.push(input);
        return Promise.resolve();
      }),
    deleteTrip:
      overrides.deleteTrip ??
      ((id) => {
        calls.deleteTrip.push(id);
        return Promise.resolve();
      }),
    setActiveTrip:
      overrides.setActiveTrip ??
      ((id) => {
        calls.setActiveTrip.push(id);
        return Promise.resolve();
      }),
    syncNow:
      overrides.syncNow ??
      (() => {
        calls.syncNow += 1;
        return Promise.resolve({
          processed: 0,
          applied: 0,
          retried: 0,
          blocked: 0,
          deadLettered: 0,
          skipped: 0,
        });
      }),
    calls,
  };
}

async function renderRoute(opts: HarnessOptions = {}): Promise<{
  services: AppServices;
  admin: ReturnType<typeof makeAdminStub>;
  db: TravelDB;
}> {
  const db = makeTestDb('trips-route');
  for (const t of opts.seedTrips ?? []) {
    await upsertTrip(t, db);
  }
  const kvInitial: Partial<Record<'travel_folder_file_id' | 'active_trip_id', unknown>> = {};
  if (opts.travelFolderId !== undefined) kvInitial.travel_folder_file_id = opts.travelFolderId;
  if (opts.activeTripId !== undefined) kvInitial.active_trip_id = opts.activeTripId;
  const kv = createMemoryKVStore(kvInitial);
  const admin = makeAdminStub(opts.tripsAdmin ?? {});
  const services: AppServices = {
    kv,
    trips: createMockTripsStore(opts.seedTrips ?? []),
    tripsAdmin: admin,
    ...(opts.drivePickFolder || opts.driveGetMetadata
      ? {
          drive: {
            getMetadata:
              opts.driveGetMetadata ?? (() => Promise.reject(new Error('not used'))),
            getContent: () => Promise.reject(new Error('not used')),
            listFolder: () => Promise.reject(new Error('not used')),
            createFolder: () => Promise.reject(new Error('not used')),
            createFile: () => Promise.reject(new Error('not used')),
            updateFile: () => Promise.reject(new Error('not used')),
            pickFolder: async () => {
              const picked = await opts.drivePickFolder!();
              return { id: asFileId(picked.id), name: picked.name, path: picked.path };
            },
            getChanges: () => Promise.reject(new Error('not used')),
            startChangeToken: () => Promise.resolve(''),
          },
        }
      : {}),
  };
  // The production `listTripsAll()` reads from the default Dexie singleton;
  // in tests we want the per-test db. Delegate the spy to the original impl
  // (captured at module load) bound to the test db — this preserves
  // useLiveQuery's table-change subscriptions so the UI re-renders on
  // subsequent writes to `db` (e.g. an inbound pull).
  vi.spyOn(tripsQueries, 'listTripsAll').mockImplementation(() =>
    ORIGINAL_LIST_TRIPS_ALL(db),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <AppServicesProvider services={services}>
        <TripsRoute />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
  return { ...result, services, admin, db };
}

describe('TripsRoute — first-run folder prompt', () => {
  it('renders FirstRunFolderPrompt when travel_folder_file_id is null', async () => {
    const { admin } = await renderRoute({ travelFolderId: null });
    expect(await screen.findByTestId('first-run-pick')).toBeInTheDocument();
    expect(admin.calls.createTrip).toEqual([]);
  });

  it('calls drive.pickFolder, persists the picked folder id, and reveals the trips list', async () => {
    const user = userEvent.setup();
    const pickFolder = vi.fn().mockResolvedValue({
      id: 'fld_picked',
      name: 'Travel',
      path: 'MyVault/Travel',
    });
    const { services } = await renderRoute({
      travelFolderId: null,
      drivePickFolder: pickFolder,
    });

    const pickBtn = await screen.findByTestId('first-run-pick');
    await user.click(pickBtn);

    await waitFor(() => {
      expect(pickFolder).toHaveBeenCalled();
    });
    await waitFor(async () => {
      expect(await services.kv.get('travel_folder_file_id')).toBe('fld_picked');
    });
    // After picking, the route should swap to the trips view.
    expect(await screen.findByTestId('trips-new')).toBeInTheDocument();
  });

  it('clears a stale folder id and shows the prompt when getMetadata 404s', async () => {
    const getMetadata = vi
      .fn<() => Promise<FileMetadata>>()
      .mockRejectedValue(new DriveApiError('File not found: fld-000002', 404));
    const { services } = await renderRoute({
      travelFolderId: 'fld-000002',
      driveGetMetadata: getMetadata,
    });

    // The stale id is validated, dropped, and the first-run picker is shown.
    expect(await screen.findByTestId('first-run-pick')).toBeInTheDocument();
    expect(getMetadata).toHaveBeenCalledWith(asFileId('fld-000002'));
    await waitFor(async () => {
      expect(await services.kv.get('travel_folder_file_id')).toBeNull();
    });
  });

  it('keeps the folder id on a transient (non-404) validation error', async () => {
    const getMetadata = vi
      .fn<() => Promise<FileMetadata>>()
      .mockRejectedValue(new DriveApiError('Service unavailable', 503));
    const { services } = await renderRoute({
      travelFolderId: 'fld_travel',
      driveGetMetadata: getMetadata,
    });

    // A transient failure must not discard a good folder: the trips view loads
    // and the persisted id is untouched.
    expect(await screen.findByTestId('trips-new')).toBeInTheDocument();
    expect(await services.kv.get('travel_folder_file_id')).toBe('fld_travel');
  });
});

describe('TripsRoute — list + create flow', () => {
  const seeded = newTrip({
    slug: 'kyoto-2026',
    name: 'Kyoto 2026',
    start_date: isoDate('2026-09-01'),
    end_date: isoDate('2026-09-15'),
    home_currency: currency('USD'),
  });

  it('renders existing trips and lets the user create a new one', async () => {
    const user = userEvent.setup();
    const { admin, db } = await renderRoute({
      travelFolderId: 'fld_travel',
      seedTrips: [seeded],
    });

    expect(await screen.findByTestId(`trips-row-${seeded.id}`)).toBeInTheDocument();

    // Open the create sheet.
    await user.click(screen.getByTestId('trips-new'));
    const sheet = await screen.findByRole('dialog');
    const name = within(sheet).getByTestId('trip-form-name');
    await user.type(name, 'Lisbon 2027');
    const start = within(sheet).getByTestId('trip-form-start');
    await user.type(start, '2027-04-01');
    const end = within(sheet).getByTestId('trip-form-end');
    await user.type(end, '2027-04-10');

    // Slug preview should reflect the derived value.
    await waitFor(() => {
      expect(within(sheet).getByTestId('trip-form-slug')).toHaveTextContent('lisbon-2027');
    });

    await user.click(within(sheet).getByTestId('trip-form-submit'));

    await waitFor(() => {
      expect(admin.calls.createTrip.length).toBe(1);
    });
    const created = admin.calls.createTrip[0];
    expect(created?.name).toBe('Lisbon 2027');
    expect(created?.slug).toBe('lisbon-2027');
    expect(created?.start_date).toBe('2027-04-01');
    expect(created?.end_date).toBe('2027-04-10');

    db.close();
    await deleteDatabase(db.name);
  });

  it('Delete trip flow: clicking trash opens confirm, confirm calls deleteTrip', async () => {
    const user = userEvent.setup();
    const { admin } = await renderRoute({
      travelFolderId: 'fld_travel',
      seedTrips: [seeded],
    });

    const deleteBtn = await screen.findByTestId(`trips-delete-${seeded.id}`);
    await user.click(deleteBtn);

    expect(await screen.findByTestId('trips-delete-confirm')).toBeInTheDocument();

    await user.click(screen.getByTestId('trips-delete-confirm-button'));

    await waitFor(() => {
      expect(admin.calls.deleteTrip).toEqual([seeded.id]);
    });
  });

  it('Delete trip flow: Cancel dismisses the confirm without calling admin', async () => {
    const user = userEvent.setup();
    const { admin } = await renderRoute({
      travelFolderId: 'fld_travel',
      seedTrips: [seeded],
    });

    await user.click(await screen.findByTestId(`trips-delete-${seeded.id}`));
    await user.click(screen.getByTestId('trips-delete-cancel'));

    expect(admin.calls.deleteTrip).toEqual([]);
  });

  it('shows a trip written to Dexie post-mount without a manual refresh', async () => {
    // Regression for the "I need to refresh after syncing" bug: any write to
    // the `trips` table — local OR from the inbound Drive puller — must flow
    // through to the list immediately. useLiveQuery subscribes for us.
    const { db } = await renderRoute({
      travelFolderId: 'fld_travel',
      seedTrips: [seeded],
    });

    expect(await screen.findByTestId(`trips-row-${seeded.id}`)).toBeInTheDocument();

    const inbound = newTrip({
      slug: 'lisbon-2027',
      name: 'Lisbon 2027',
      start_date: isoDate('2027-04-01'),
      end_date: isoDate('2027-04-10'),
      home_currency: currency('EUR'),
    });
    await upsertTrip(inbound, db);

    // No remount, no refreshKey bump — the list re-renders on Dexie's change.
    expect(await screen.findByTestId(`trips-row-${inbound.id}`)).toBeInTheDocument();

    db.close();
    await deleteDatabase(db.name);
  });
});
