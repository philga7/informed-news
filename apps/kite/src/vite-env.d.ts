/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_URL: string;
  readonly VITE_STATIC_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
