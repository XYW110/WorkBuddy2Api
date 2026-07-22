/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_BRAND_NAME?: string
  readonly VITE_PAGE_TITLE?: string
  readonly VITE_FEATURE_CHECKIN?: string
  readonly VITE_FEATURE_QUOTA?: string
  readonly VITE_FEATURE_API_KEYS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
