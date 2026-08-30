import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot';
import { createDexieKVStore } from './app/dexie-kv-store';
import { createDexieTripsStore } from './app/trips-store';
import { createTripsAdmin } from './app/trips-admin';
import { resolveParent as resolveParentHelper } from './app/resolve-parent';
import {
  DriveAuth,
  RealDriveClient,
  openFolderPicker,
  FakeDrive,
  type AuthPersistence,
} from './sync/drive';
import { createDexieWriteQueue } from './sync/queue';
import { createSyncEngine } from './app/create-sync-engine';
import { db } from './lib/storage';
import { registerTripReconcilers } from './features/trips/register';
import { registerAccommodationReconcilers } from './features/accommodations/register';
import { registerPlaceReconcilers } from './features/places/register';
import { registerTaskReconcilers, createTasksAdmin } from './features/tasks';
import { registerShoppingReconcilers, createShoppingAdmin } from './features/shopping';
import { registerArticleReconcilers, createArticlesAdmin } from './features/articles';
import './index.css';

registerTripReconcilers();
registerAccommodationReconcilers();
registerPlaceReconcilers();
registerTaskReconcilers();
registerShoppingReconcilers();
registerArticleReconcilers();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const developerKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

import type { DriveClient } from './sync/drive';
import { GeminiClient } from './lib/ai/client';
import { RealGmailClient, type GmailClient } from './lib/gmail';

/**
 * Combined OAuth scope (ADR-0003 + ADR-0016). The single GIS access token now
 * authorizes both Drive and read-only Gmail. gmail.readonly is a Google
 * "restricted" scope; fine in the current testing-mode single-user consent.
 */
const OAUTH_SCOPE =
  'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly openid email profile';

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

// Hoisted above the drive wiring so the same constant feeds the guard,
// resolvePath placeholder, and the resolveParent walk below.
const TRAVEL_PREFIX = 'Travel';

let drive: DriveClient;
let gmail: GmailClient | undefined;
if (clientId && developerKey) {
  const persistence = createLocalStoragePersistence();
  const auth = new DriveAuth({ clientId, scope: OAUTH_SCOPE, ...(persistence ? { persistence } : {}) });
  // Same token, read-only Gmail (ADR-0016).
  gmail = new RealGmailClient({ getAccessToken: () => auth.getAccessToken() });
  drive = new RealDriveClient({
    auth,
    allowedPrefix: TRAVEL_PREFIX,
    resolvePath: () => Promise.resolve(TRAVEL_PREFIX), // Placeholder until S6 path resolver lands
    openPicker: async () =>
      openFolderPicker({
        accessToken: await auth.getAccessToken(),
        developerKey,
        resolvePath: () => Promise.resolve(TRAVEL_PREFIX),
      }),
  });
} else {
  drive = new FakeDrive({ allowedPrefix: TRAVEL_PREFIX });
}

const kv = createDexieKVStore(db);
const trips = createDexieTripsStore(db);
const writeQueue = createDexieWriteQueue(db);

// Per-session memo for the mkdir-p walk inside resolveParent. Cleared on
// reload, which is fine — re-listing is idempotent.
const folderCache = new Map<string, string>();

async function resolveParent(item: Parameters<typeof resolveParentHelper>[0]) {
  const travelFolder = await kv.get('travel_folder_file_id');
  if (!travelFolder) return null;
  return resolveParentHelper(item, {
    drive,
    travelFolderId: travelFolder,
    allowedPrefix: TRAVEL_PREFIX,
    folderCache,
  });
}

const tripsAdmin = createTripsAdmin({
  db,
  writeQueue,
  travelFolderPath: TRAVEL_PREFIX,
});

const tasksAdmin = createTasksAdmin({
  db,
  writeQueue,
  travelFolderPath: TRAVEL_PREFIX,
});

const shoppingAdmin = createShoppingAdmin({
  db,
  writeQueue,
  travelFolderPath: TRAVEL_PREFIX,
});

const articlesAdmin = createArticlesAdmin({
  db,
  writeQueue,
  travelFolderPath: TRAVEL_PREFIX,
});

/**
 * The sync engine (ADR-0019). Owns every push/pull trigger; nothing in the UI
 * initiates sync. `Shell` starts it on mount.
 */
const sync = createSyncEngine({ db, kv, drive, writeQueue, resolveParent });

const services = {
  kv,
  trips,
  tripsAdmin,
  tasksAdmin,
  shoppingAdmin,
  articlesAdmin,
  drive,
  writeQueue,
  sync,
  ...(geminiKey ? { ai: new GeminiClient(geminiKey) } : {}),
  ...(gmail ? { gmail } : {}),
};

createRoot(root).render(
  <StrictMode>
    <AppRoot services={services} />
  </StrictMode>,
);
