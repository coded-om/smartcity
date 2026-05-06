const DEFAULT_PORT = Number(process.env.REACT_APP_BACKEND_PORT || 5000);

let cachedApiBase = null;
let resolvingPromise = null;

function buildApiBase(port) {
  return `http://${window.location.hostname}:${port}/api`;
}

function candidatePorts() {
  const preferred = [DEFAULT_PORT];
  const fallback = [5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010];
  return [...new Set([...preferred, ...fallback])];
}

async function probeApiBase(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/stats`);
    const payload = await response.json();
    return Boolean(payload && typeof payload === 'object' && 'success' in payload && 'data' in payload);
  } catch {
    return false;
  }
}

export async function resolveApiBase() {
  if (cachedApiBase) return cachedApiBase;
  if (resolvingPromise) return resolvingPromise;

  resolvingPromise = (async () => {
    for (const port of candidatePorts()) {
      const baseUrl = buildApiBase(port);
      // eslint-disable-next-line no-await-in-loop
      if (await probeApiBase(baseUrl)) {
        cachedApiBase = baseUrl;
        return cachedApiBase;
      }
    }

    // Fallback keeps behavior predictable even if discovery fails.
    cachedApiBase = buildApiBase(DEFAULT_PORT);
    return cachedApiBase;
  })();

  try {
    return await resolvingPromise;
  } finally {
    resolvingPromise = null;
  }
}

export function getApiBase() {
  return cachedApiBase || buildApiBase(DEFAULT_PORT);
}

export function getApiOrigin() {
  return getApiBase().replace(/\/api$/, '');
}

export async function apiFetch(path, options = {}) {
  const baseUrl = await resolveApiBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${baseUrl}${normalizedPath}`, options);
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
