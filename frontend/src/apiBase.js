// All API calls use relative paths so they go through the CRA dev-server proxy
// (package.json "proxy" field) — no CORS headers needed.
const BACKEND_PORT = Number(process.env.REACT_APP_BACKEND_PORT || 5000);

export async function resolveApiBase() {
  return '/api';
}

export function getApiBase() {
  return '/api';
}

// Absolute origin used only for media streams (MJPEG img src, etc.)
// which cannot go through the CRA proxy.
export function getApiOrigin() {
  return `http://${window.location.hostname}:${BACKEND_PORT}`;
}

export function getPersonPhotoUrl(personId) {
  return `/api/persons/${personId}/photo`;
}

export async function apiFetch(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`/api${normalizedPath}`, options);
}

// ── MediaMTX HLS helpers ──────────────────────────────────────────────────────
const HLS_PORT = Number(process.env.REACT_APP_HLS_PORT || 8888);

/**
 * Convert a device_id to a MediaMTX path name.
 * ESP32_Factory01 → factory01
 */
function deviceToMediaPath(deviceId) {
  return deviceId.replace(/^ESP32_/i, '').toLowerCase();
}

/** HLS stream URL served by MediaMTX */
export function getHlsStreamUrl(deviceId) {
  const path = deviceToMediaPath(deviceId);
  return `http://${window.location.hostname}:${HLS_PORT}/${path}/index.m3u8`;
}

/** Base URL of the MediaMTX server (for health checks) */
export function getMediaServerBase() {
  return `http://${window.location.hostname}:${HLS_PORT}`;
}
