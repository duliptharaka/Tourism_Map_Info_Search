/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Override Overpass proxy path (default `/api/overpass`). */
  readonly VITE_OVERPASS_PROXY_PATH?: string;
  /** Override Photon geocode proxy path (default `/api/photon`). */
  readonly VITE_PHOTON_PROXY_PATH?: string;
}
