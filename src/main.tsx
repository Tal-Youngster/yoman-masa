import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot';
import { createDexieKVStore } from './app/dexie-kv-store';
import { createDexieTripsStore } from './app/trips-store';
import { createTripsAdmin } from './app/trips-admin';
import { DriveAuth, RealDriveClient, openFolderPicker, FakeDrive, asFileId } from './sync/drive';
import { createDexieWriteQueue } from './sync/queue';
import { db } from './lib/storage';
import { registerTripReconcilers } from './features/trips/register';
import { registerAccommodationReconcilers } from './features/accommodations/register';
import { registerPlaceReconcilers } from './features/places/register';
import { registerExpenseReconcilers, createExpensesAdmin } from './features/expenses';
import './index.css';

registerTripReconcilers();
registerAccommodationReconcilers();
registerPlaceReconcilers();
registerExpenseReconcilers();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const developerKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

import type { DriveClient } from './sync/drive';
import { GeminiClient } from './lib/ai/client';

let drive: DriveClient;
if (clientId && developerKey) {
  const auth = new DriveAuth({ clientId });
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

const services = {
  kv,
  trips,
  tripsAdmin,
  expensesAdmin,
  drive,
  writeQueue,
  ...(geminiKey ? { ai: new GeminiClient(geminiKey) } : {}),
};

createRoot(root).render(
  <StrictMode>
    <AppRoot services={services} />
  </StrictMode>,
);
