/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_API_KEY: string;
  /** Optional Map ID for Google Advanced Markers; falls back to DEMO_MAP_ID. See ADR-0013. */
  readonly VITE_GOOGLE_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
