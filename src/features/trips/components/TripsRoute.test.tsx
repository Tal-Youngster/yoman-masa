// @vitest-environment jsdom
import 'fake-indexeddb/auto';

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppServicesProvider, type AppServices, type TripsAdminService } from '@/app/context';
import { createMemoryKVStore } from '@/app/kv-store';
import { createMockTripsStore } from '@/app/trips-store';
import { asFileId } from '@/sync/drive';
import type { Trip } from '@/domain';
import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';
import { newTrip } from '@/domain/trip';
import { upsertTrip, type TravelDB } from '@/lib/storage';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';

import { TripsRoute } from './TripsRoute';

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
}

function makeAdminStub(
  overrides: Partial<TripsAdminService> = {},
): TripsAdminService & {
  calls: {
    createTrip: Array<Parameters<TripsAdminService['createTrip']>[0]>;
    updateTrip: Array<Parameters<TripsAdminService['updateTrip']>[0]>;
    setActiveTrip: Array<Parameters<TripsAdminService['setActiveTrip']>[0]>;
    syncNow: number;
  };
} {
  const calls = {
    createTrip: [] as Array<Parameters<TripsAdminService['createTrip']>[0]>,
    updateTrip: [] as Array<Parameters<TripsAdminService['updateTrip']>[0]>,
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
    ...(opts.drivePickFolder
      ? {
          drive: {
            getMetadata: () => Promise.reject(new Error('not used')),
            getContent: () => Promise.reject(new Error('not used')),
            listFolder: () => Promise.reject(new Error('not used')),
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
  // We override the trips-route queries by stubbing them through db default —
  // the production `listTripsAll()` reads from the default singleton, but in
  // tests we want the per-test db. Patch the queries module's listTripsAll
  // for the duration of this render.
  const queriesModule = await import('../queries');
  vi.spyOn(queriesModule, 'listTripsAll').mockImplementation(() => Promise.resolve(opts.seedTrips ?? []));

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
});

describe('TripsRoute — list + create flow', () => {
  const seeded = newTrip({
    slug: 'kyoto-2026',
    name: 'Kyoto 2026',
    start_date: isoDate('2026-09-01'),
    end_date: isoDate('2026-09-15'),
    home_currency: currency('USD'),
    status: 'active',
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

  it('Set active calls tripsAdmin.setActiveTrip', async () => {
    const user = userEvent.setup();
    const planned = newTrip({
      slug: 'lisbon-2027',
      name: 'Lisbon 2027',
      start_date: isoDate('2027-04-01'),
      end_date: isoDate('2027-04-10'),
      home_currency: currency('EUR'),
      status: 'planned',
    });
    const { admin } = await renderRoute({
      travelFolderId: 'fld_travel',
      seedTrips: [seeded, planned],
      activeTripId: seeded.id,
    });

    const setActiveBtn = await screen.findByTestId(`trips-set-active-${planned.id}`);
    await user.click(setActiveBtn);

    await waitFor(() => {
      expect(admin.calls.setActiveTrip).toEqual([planned.id]);
    });
  });
});
