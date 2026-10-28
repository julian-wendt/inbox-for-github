/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" starts the app on synthetic data instead of GitHub (see `isDemo`). */
  readonly VITE_DEMO?: string;
}

/** The git commit the app was built from, e.g. "7fea56b" or "7fea56b-dirty"; set in `vite.config.ts`. */
declare const __APP_COMMIT__: string;
