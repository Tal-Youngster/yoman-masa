import 'fake-indexeddb/auto';

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/render-app';
import { makeTrip } from '@/test/fixtures';
import { asFileId, DriveApiError, type DriveClient } from '@/sync/drive';
import { TABS } from './tabs';

beforeAll(() => {
  // jsdom doesn't implement <dialog>.showModal()/close(); polyfill minimally.
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

describe('Shell', () => {
  it('renders the top bar, navs, and the Dashboard route by default', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Travel Journal' })).toBeInTheDocument();

    // Two <nav> elements (side + bottom). At least one must show every tab.
    const navs = await screen.findAllByRole('navigation', { name: 'Primary' });
    expect(navs.length).toBeGreaterThanOrEqual(2);
    for (const tab of TABS) {
      // Side nav uses the long label; assert at least one nav contains it.
      const matches = navs.flatMap((nav) => within(nav).queryAllByText(tab.label, { exact: true }));
      expect(matches.length, `tab ${tab.label}`).toBeGreaterThan(0);
    }

    // The Trips master tab is rendered separately from the per-trip tabs.
    const tripsMatches = navs.flatMap((nav) => within(nav).queryAllByText('Trips', { exact: true }));
    expect(tripsMatches.length).toBeGreaterThan(0);

    // Trip Overview (the default route) rendered.
    expect(await screen.findByRole('heading', { name: 'Trip Overview' })).toBeInTheDocument();
  });

  it('navigates between all tabs, including the separated Trips master tab', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('heading', { name: 'Trip Overview' });

    for (const tab of TABS) {
      const navs = await screen.findAllByRole('navigation', { name: 'Primary' });
      const sideNav = navs[0];
      if (!sideNav) throw new Error('expected primary nav');
      const link = within(sideNav).getByRole('link', { name: tab.label });
      await user.click(link);
      // The route's heading matches the tab label.
      await screen.findByRole('heading', { name: tab.label });
    }

    // The Trips master tab lives outside TABS but still navigates.
    const navs = await screen.findAllByRole('navigation', { name: 'Primary' });
    const sideNav = navs[0];
    if (!sideNav) throw new Error('expected primary nav');
    await user.click(within(sideNav).getByRole('link', { name: 'Trips' }));
    await screen.findByRole('heading', { name: 'Trips' });
  });

  it('uses aria-current on the active link', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('heading', { name: 'Trip Overview' });

    const navs = await screen.findAllByRole('navigation', { name: 'Primary' });
    const sideNav = navs[0];
    if (!sideNav) throw new Error('expected primary nav');

    const tasks = within(sideNav).getByRole('link', { name: 'Tasks' });
    await user.click(tasks);

    await waitFor(() => {
      expect(within(sideNav).getByRole('link', { name: 'Tasks' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
    // Dashboard link should no longer be aria-current.
    expect(within(sideNav).getByRole('link', { name: 'Trip Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('trip switcher shows the active trip name and lets the user switch', async () => {
    const user = userEvent.setup();
    // Status is derived from dates. tripA spans a wide window so it stays
    // 'active' under any real "today" the test runner uses; tripB is far in
    // the future so it stays 'planned'.
    const tripA = makeTrip({
      id: 'trip-a' as ReturnType<typeof makeTrip>['id'],
      slug: 'kyoto-2026',
      name: 'Kyoto 2026',
      start_date: '2020-01-01' as ReturnType<typeof makeTrip>['start_date'],
      end_date: '2099-12-31' as ReturnType<typeof makeTrip>['end_date'],
    });
    const tripB = makeTrip({
      id: 'trip-b' as ReturnType<typeof makeTrip>['id'],
      slug: 'lisbon-2027',
      name: 'Lisbon 2027',
      start_date: '2200-04-01' as ReturnType<typeof makeTrip>['start_date'],
      end_date: '2200-04-15' as ReturnType<typeof makeTrip>['end_date'],
    });
    const { services } = renderApp({ trips: [tripA, tripB] });

    // Default selection picks the first 'active' trip.
    const trigger = await screen.findByTestId('trip-switcher-trigger');
    await waitFor(() => {
      expect(trigger).toHaveTextContent('Kyoto 2026');
    });
    await waitFor(async () => {
      expect(await services.kv.get('active_trip_id')).toBe('trip-a');
    });

    // Open switcher, choose Lisbon.
    await user.click(trigger);
    const option = await screen.findByTestId('trip-switcher-option-trip-b');
    await user.click(option);

    await waitFor(() => {
      expect(trigger).toHaveTextContent('Lisbon 2027');
    });
    expect(await services.kv.get('active_trip_id')).toBe('trip-b');
  });

  it('trip switcher prompts to create a trip when none exist', async () => {
    renderApp({ trips: [] });
    const trigger = await screen.findByTestId('trip-switcher-trigger');
    await waitFor(() => {
      expect(trigger).toHaveTextContent('No trips yet');
    });

    const user = userEvent.setup();
    await user.click(trigger);
    expect(await screen.findByTestId('trip-switcher-create')).toBeInTheDocument();
  });

  it('clears a stale Travel folder id on startup even off the Trips route', async () => {
    const getMetadata = vi
      .fn<DriveClient['getMetadata']>()
      .mockRejectedValue(new DriveApiError('File not found: fld-000002', 404));
    const reject = (): never => {
      throw new Error('not used');
    };
    const drive: DriveClient = {
      getMetadata,
      getContent: reject,
      listFolder: reject,
      createFolder: reject,
      createFile: reject,
      updateFile: reject,
      pickFolder: reject,
      getChanges: reject,
      startChangeToken: reject,
    };
    // Land on the dashboard ('/'), NOT /trips, with a stale folder id persisted.
    const { services } = renderApp({ initialPath: '/', travelFolderId: 'fld-000002', drive });

    await screen.findByRole('heading', { name: 'Trip Overview' });
    await waitFor(async () => {
      expect(await services.kv.get('travel_folder_file_id')).toBeNull();
    });
    expect(getMetadata).toHaveBeenCalledWith(asFileId('fld-000002'));
  });
});
