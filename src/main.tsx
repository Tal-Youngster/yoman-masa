import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot';
import { createDexieKVStore } from './app/dexie-kv-store';
import { createDexieTripsStore } from './app/trips-store';
import { createTripsAdmin } from './app/trips-admin';
import {
  DriveAuth,
  RealDriveClient,
  openFolderPicker,
  FakeDrive,
  asFileId,
  type AuthPersistence,
} from './sync/drive';
import { createDexieWriteQueue } from './sync/queue';
import { db } from './lib/storage';
import { registerTripReconcilers } from './features/trips/register';
import { registerAccommodationReconcilers } from './features/accommodations/register';
import { registerPlaceReconcilers } from './features/places/register';
import { registerExpenseReconcilers, createExpensesAdmin } from './features/expenses';
import { registerTaskReconcilers, createTasksAdmin } from './features/tasks';
import './index.css';

registerTripReconcilers();
registerAccommodationReconcilers();
registerPlaceReconcilers();
registerExpenseReconcilers();
registerTaskReconcilers();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const developerKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

import type { DriveClient } from './sync/drive';
import { GeminiClient } from './lib/ai/client';

/**
 * localStorage-backed auth persistence. ADR-0003 forbids storing refresh
 * tokens; the access token here is the short-lived (~1h) one, persisted only
 * so a page reload doesn't have to round-trip GIS. Tradeoff: any XSS on the
 * app origin can read it. Acceptable for a single-user PWA with no 3p JS.
 */
const TOKEN_KEY = 'drive.accessToken.v1';
const HINT_KEY = 'drive.loginHint.v1';
function createLocalStoragePersistence(): AuthPersistence | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  return {
    loadToken() {
      try {
        const raw = localStorage.getItem(TOKEN_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as { accessToken?: unknown }).accessToken === 'string' &&
          typeof (parsed as { expiresAt?: unknown }).expiresAt === 'number'
        ) {
          return parsed as { accessToken: string; expiresAt: number };
        }
        return null;
      } catch {
        return null;
      }
    },
    saveToken(token) {
      try {
        if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        else localStorage.removeItem(TOKEN_KEY);
      } catch {
        // Storage might be full / disabled; persistence is best-effort.
      }
    },
    loadHint() {
      try {
        return localStorage.getItem(HINT_KEY);
      } catch {
        return null;
      }
    },
    saveHint(hint) {
      try {
        localStorage.setItem(HINT_KEY, hint);
      } catch {
        // Best-effort.
      }
    },
  };
}

let drive: DriveClient;
if (clientId && developerKey) {
  const persistence = createLocalStoragePersistence();
  const auth = new DriveAuth({ clientId, ...(persistence ? { persistence } : {}) });
  drive = new RealDriveClient({
    auth,
    allowedPrefix: 'Travel',
    resolvePath: () => Promise.resolve('Travel'), // Placeholder until S6 path resolver lands
    openPicker: async () =>
      openFolderPicker({
        accessToken: await auth.getAccessToken(),
        developerKey,
        resolvePath: () => Promise.resolve('Travel'),
      }),
  });
} else {
  drive = new FakeDrive({ allowedPrefix: 'Travel' });
}

const kv = createDexieKVStore(db);
const trips = createDexieTripsStore(db);
const writeQueue = createDexieWriteQueue(db);

const folderCache = new Map<string, string>();

const tripsAdmin = createTripsAdmin({
  db,
  writeQueue,
  drive,
  travelFolderPath: 'Travel', // Defaults to 'Travel' for path prefixing
  travelFolderId: asFileId(''), // Placeholder, overriden by resolveParent
  resolveParent: async (item) => {
    const travelFolder = await kv.get('travel_folder_file_id');
    if (!travelFolder) return null;
    
    const parts = item.resolvedPath.split('/').filter(Boolean);
    if (parts.length <= 1) return asFileId(travelFolder);
    
    const folderNames = parts.slice(0, -1);
    let currentParent = travelFolder;
    let currentPath = '';
    
    for (const name of folderNames) {
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      if (folderCache.has(currentPath)) {
        currentParent = folderCache.get(currentPath)!;
        continue;
      }
      
      const files = await drive.listFolder(asFileId(currentParent));
      let found = files.find(f => f.name === name && f.isFolder);
      if (!found) {
        found = await drive.createFolder(asFileId(currentParent), name);
      }
      folderCache.set(currentPath, found.id);
      currentParent = found.id;
    }
    
    return asFileId(currentParent);
  },
});

const expensesAdmin = createExpensesAdmin({
  db,
  writeQueue,
  travelFolderPath: 'Travel',
  today: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
});

const tasksAdmin = createTasksAdmin({
  db,
  writeQueue,
  travelFolderPath: 'Travel',
});

const services = {
  kv,
  trips,
  tripsAdmin,
  expensesAdmin,
  tasksAdmin,
  drive,
  writeQueue,
  ...(geminiKey ? { ai: new GeminiClient(geminiKey) } : {}),
};

createRoot(root).render(
  <StrictMode>
    <AppRoot services={services} />
  </StrictMode>,
);
