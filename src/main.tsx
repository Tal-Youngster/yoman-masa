import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot';
import { createMemoryKVStore } from './app/kv-store';
import { createMockTripsStore } from './app/trips-store';
import { DriveAuth, RealDriveClient, openFolderPicker } from './sync/drive';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

const driveAuth = new DriveAuth({
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
});

const drive = new RealDriveClient({
  auth: driveAuth,
  allowedPrefix: 'Travel', // Placeholder for now
  resolvePath: async () => 'Travel', // Stub for path resolution
  openPicker: async () => {
    const token = await driveAuth.getAccessToken();
    return openFolderPicker({
      accessToken: token,
      developerKey: import.meta.env.VITE_GOOGLE_API_KEY,
      resolvePath: async () => 'Travel', // Stub
    });
  },
});

const services = {
  kv: createMemoryKVStore(),
  trips: createMockTripsStore(),
  drive,
};

createRoot(root).render(
  <StrictMode>
    <AppRoot services={services} />
  </StrictMode>,
);
