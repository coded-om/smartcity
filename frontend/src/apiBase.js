const BACKEND_PORT = Number(process.env.REACT_APP_BACKEND_PORT || 5000);

export async function resolveApiBase() {
  return '/api';
}

export function getApiBase() {
  return '/api';
}

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

const HLS_PORT = Number(process.env.REACT_APP_HLS_PORT || 8888);

function deviceToMediaPath(deviceId) {
  return deviceId.replace(/^ESP32_/i, '').toLowerCase();
}

export function getHlsStreamUrl(deviceId) {
  const path = deviceToMediaPath(deviceId);
  return `http://${window.location.hostname}:${HLS_PORT}/${path}/index.m3u8`;
}

export function getMediaServerBase() {
  return `http://${window.location.hostname}:${HLS_PORT}`;
}
