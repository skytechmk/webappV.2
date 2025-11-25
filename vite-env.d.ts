/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'virtual:pwa-register/react' {
  export function useRegisterSW(options?: {
    onRegistered?: (registration: ServiceWorkerRegistration) => void
    onRegisterError?: (error: any) => void
  }): {
    offlineReady: [boolean, (value: boolean) => void]
    needRefresh: [boolean, (value: boolean) => void]
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  }
}