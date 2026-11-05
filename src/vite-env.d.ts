/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  readonly VITE_CLOUDBASE_REGION?: string;
  readonly VITE_CLOUDBASE_PUBLISHABLE_KEY?: string;
  readonly VITE_LUNASOL_AI_BASE_URL?: string;
  readonly VITE_LUNASOL_AI_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
