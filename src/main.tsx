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
const developerKey = import.meta.env.VITE_GOOGLE_PICKER_DEVELOPER_KEY as string | undefined;
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

const tripsAdmin = createTripsAdmin({
  db,
  writeQueue,
  drive,
  travelFolderPath: 'Travel', // Defaults to 'Travel' for path prefixing
  travelFolderId: asFileId(''), // Placeholder, overriden by resolveParent
  resolveParent: async () => {
    const folder = await kv.get('travel_folder_file_id');
    return folder ? asFileId(folder) : null;
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
