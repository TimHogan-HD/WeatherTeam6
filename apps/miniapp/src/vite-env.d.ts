/// <reference types="vite/client" />

declare module 'virtual:wt6-tokens.css'

interface ImportMetaEnv {
  /** Base URL of the WeatherTeam6 API. Public — inlined into the bundle. */
  readonly VITE_API_BASE_URL?: string
}
