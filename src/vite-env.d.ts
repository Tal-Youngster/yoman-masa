/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_API_KEY: string;
  /** Optional Map ID for Google Advanced Markers; falls back to DEMO_MAP_ID. See ADR-0013. */
  readonly VITE_GOOGLE_MAP_ID?: string;
  /** Optional. Billable and bundled client-side; omit to disable AI features. */
  readonly VITE_GEMINI_API_KEY?: string;
  /** Optional override for the default Gemini model id. */
  readonly VITE_GEMINI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
