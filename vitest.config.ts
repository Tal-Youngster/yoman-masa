import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: false,
      environment: 'node',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      environmentMatchGlobs: [
        ['src/ui/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
        ['src/app/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
      ],
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/main.tsx', 'src/test/**'],
      },
    },
  }),
);
