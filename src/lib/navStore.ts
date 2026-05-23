import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TABS, type TabDef } from '../ui/layout/tabs';

export interface NavState {
  tabOrder: TabDef['to'][];
  setTabOrder: (newOrder: TabDef['to'][]) => void;
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      tabOrder: TABS.map((t) => t.to),
      setTabOrder: (newOrder) => set({ tabOrder: newOrder }),
    }),
    {
      name: 'travel-journal-nav-preferences',
    }
  )
);
