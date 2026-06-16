import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TABS, type TabDef } from '../ui/layout/tabs';

export interface NavState {
  tabOrder: TabDef['to'][];
  setTabOrder: (newOrder: TabDef['to'][]) => void;
}

const DEFAULT_ORDER = (): TabDef['to'][] => TABS.map((t) => t.to);

/**
 * Drop unknown paths (e.g. a removed tab, or the now-separated `/trips` master
 * tab from an older persisted order) and append any tab missing from the stored
 * order so newly-added tabs always surface.
 */
function reconcileOrder(stored: readonly string[]): TabDef['to'][] {
  const valid = new Set<string>(TABS.map((t) => t.to));
  const kept = stored.filter((to): to is TabDef['to'] => valid.has(to));
  const missing = DEFAULT_ORDER().filter((to) => !kept.includes(to));
  return [...kept, ...missing];
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      tabOrder: DEFAULT_ORDER(),
      setTabOrder: (newOrder) => set({ tabOrder: newOrder }),
    }),
    {
      name: 'travel-journal-nav-preferences',
      version: 2,
      // v1 stored `/trips` and a now-removed `/path-map` entry in the order;
      // reconcile so the master tab and dead routes don't leak into the nav.
      migrate: (persisted): NavState => {
        const order = (persisted as Partial<NavState> | undefined)?.tabOrder ?? DEFAULT_ORDER();
        return { tabOrder: reconcileOrder(order), setTabOrder: () => undefined };
      },
      merge: (persisted, current): NavState => {
        const order = (persisted as Partial<NavState> | undefined)?.tabOrder ?? DEFAULT_ORDER();
        return { ...current, tabOrder: reconcileOrder(order) };
      },
    },
  ),
);
