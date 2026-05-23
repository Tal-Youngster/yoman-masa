import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot';
import { createMemoryKVStore } from './app/kv-store';
import { createMockTripsStore } from './app/trips-store';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

const services = {
  kv: createMemoryKVStore(),
  trips: createMockTripsStore(),
};

createRoot(root).render(
  <StrictMode>
    <AppRoot services={services} />
  </StrictMode>,
);
