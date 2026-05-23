import 'fake-indexeddb/auto';

import { describe, it, expect, beforeAll } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/render-app';
import { makeTrip } from '@/test/fixtures';
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

    // Dashboard placeholder rendered.
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('navigates between all 8 tabs', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('heading', { name: 'Dashboard' });

    for (const tab of TABS) {
      const navs = await screen.findAllByRole('navigation', { name: 'Primary' });
      const sideNav = navs[0];
      if (!sideNav) throw new Error('expected primary nav');
      const link = within(sideNav).getByRole('link', { name: tab.label });
      await user.click(link);
      // The placeholder route's Card title matches the tab label.
      await screen.findByRole('heading', { name: tab.label });
    }
  });

  it('uses aria-current on the active link', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('heading', { name: 'Dashboard' });

    const navs = await screen.findAllByRole('navigation', { name: 'Primary' });
    const sideNav = navs[0];
    if (!sideNav) throw new Error('expected primary nav');

    const expenses = within(sideNav).getByRole('link', { name: 'Expenses' });
    await user.click(expenses);

    await waitFor(() => {
      expect(within(sideNav).getByRole('link', { name: 'Expenses' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
    // Dashboard link should no longer be aria-current.
    expect(within(sideNav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
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
});
