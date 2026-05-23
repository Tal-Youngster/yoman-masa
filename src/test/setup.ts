import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof window !== 'undefined') {
  window.URL.createObjectURL = () => 'mock-url';
}

afterEach(() => {
  cleanup();
});
