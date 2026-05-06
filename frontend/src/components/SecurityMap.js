import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  FiMapPin, FiWifi, FiWifiOff, FiAlertTriangle, FiEdit2, FiCheck,
} from 'react-icons/fi';
import { apiFetch } from '../apiBase';
import { cn, alertTypeIcon, severityBg, formatRelative } from '../lib/utils';

// Fix default Leaflet marker icons (CRA issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl:       require('leaflet/dist/images/marker-icon.png'),
  shadowUrl:     require('leaflet/dist/images/marker-shadow.png'),
});

// ── Custom marker icon factory ─────────────────────────────────────────────
function makeIcon(color, size = 28) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.3}">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${color}" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html:       `<div style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6))">${svg}</div>`,
    className:  '',
    iconSize:   [size, size * 1.3],
    iconAnchor: [size / 2, size * 1.3],
    popupAnchor:[0, -(size * 1.3)],
  });
}

const ICONS = {
  online:  makeIcon('#22c55e'),
  offline: makeIcon('#ef4444'),
  alert:   makeIcon('#f59e0b'),
};

// Default center (Riyadh)
const DEFAULT_CENTER = [24.7136, 46.6753];
const DEFAULT_ZOOM   = 16;

// Recenter map when devices first load
function Recenter({ devices }) {
  const map = useMap();
  useEffect(() => {
    const valid = devices.filter(d => d.lat && d.lng);
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], DEFAULT_ZOOM);
    } else if (valid.length > 1) {
      const bounds = L.latLngBounds(valid.map(d => [d.lat, d.lng]));
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [devices.length]); // eslint-disable-line
  return null;
}

function DevicePopup({ device, alerts, onLocationEdit }) {
  const [editMode, setEditMode] = useState(false);
  const [lat, setLat] = useState(String(device.lat ?? ''));
  const [lng, setLng] = useState(String(device.lng ?? ''));

  const devAlerts = (alerts || []).filter(a => a.device_id === device.device_id && !a.resolved).slice(0, 3);

  const saveLocation = async () => {
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (!isNaN(latN) && !isNaN(lngN)) {
      try {
        await apiFetch(`/devices/${device.device_id}/location`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latN, lng: lngN }),
        });
        onLocationEdit(device.device_id, latN, lngN);
      } catch {}
    }
    setEditMode(false);
  };

  return (
    <div className="min-w-52 font-sans">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', device.online ? 'bg-emerald-400' : 'bg-red-400')} />
        <strong className="text-sm text-gray-900">{device.device_id}</strong>
      </div>
      <p className="text-xs text-gray-500 mb-2">{device.location || 'Unknown location'}</p>

      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
        <span>{device.online ? '🟢 Online' : '🔴 Offline'}</span>
        <span>{device.status}</span>
      </div>

      {devAlerts.length > 0 && (
        <div className="space-y-1 mb-2">
          {devAlerts.map(a => (
            <div key={a.id} className="flex items-center gap-1 text-xs">
              <span>{alertTypeIcon(a.alert_type)}</span>
              <span className="text-gray-700">{a.alert_type}</span>
              <span className="ml-auto text-gray-400">{formatRelative(a.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {editMode ? (
        <div className="space-y-1">
          <input value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude"
            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
          <input value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude"
            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400" />
          <button onClick={saveLocation}
            className="w-full bg-blue-500 text-white rounded px-2 py-1 text-xs hover:bg-blue-600">
            Save
          </button>
        </div>
      ) : (
        <button onClick={() => setEditMode(true)}
          className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
          <FiEdit2 className="text-xs" /> Edit location
        </button>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

function SecurityMap({ devices: propDevices, alerts }) {
  const [devices, setDevices] = useState(propDevices || []);

  // Sync with prop changes
  useEffect(() => { setDevices(propDevices || []); }, [propDevices]);

  const handleLocationEdit = (deviceId, lat, lng) => {
    setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, lat, lng } : d));
  };

  const mappableDevices = devices.filter(d => d.lat && d.lng);
  const unmappedDevices = devices.filter(d => !d.lat || !d.lng);

  // Devices with open critical alerts
  const criticalDevices = new Set(
    (alerts || []).filter(a => a.severity === 'CRITICAL' && !a.resolved).map(a => a.device_id)
  );

  const getIcon = (d) => {
    if (criticalDevices.has(d.device_id)) return ICONS.alert;
    return d.online ? ICONS.online : ICONS.offline;
  };

  return (
    <div className="space-y-4 animate-fade-in h-full">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 bg-surface-600 border border-surface-500 rounded-2xl px-5 py-3">
        {[
          { color: 'bg-emerald-400', label: 'Online' },
          { color: 'bg-red-400',     label: 'Offline' },
          { color: 'bg-amber-400',   label: 'Active Alert' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-400">
            <span className={cn('w-3 h-3 rounded-full', color)} />
            {label}
          </div>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          {mappableDevices.length} / {devices.length} devices on map
        </span>
      </div>

      {/* Map */}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden" style={{ height: '55vh', minHeight: 400 }}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ width: '100%', height: '100%' }}
          zoomControl
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
          />
          <Recenter devices={mappableDevices} />

          {mappableDevices.map(d => (
            <React.Fragment key={d.device_id}>
              <Marker position={[d.lat, d.lng]} icon={getIcon(d)}>
                <Popup maxWidth={220}>
                  <DevicePopup device={d} alerts={alerts} onLocationEdit={handleLocationEdit} />
                </Popup>
              </Marker>

              {/* Alert radius circle for devices with critical alerts */}
              {criticalDevices.has(d.device_id) && (
                <Circle
                  center={[d.lat, d.lng]}
                  radius={30}
                  pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.1, weight: 2 }}
                />
              )}
            </React.Fragment>
          ))}
        </MapContainer>
      </div>

      {/* Unmapped devices notice */}
      {unmappedDevices.length > 0 && (
        <div className="bg-surface-600 border border-surface-500 rounded-2xl p-4">
          <p className="text-sm text-slate-400 mb-3 flex items-center gap-2">
            <FiMapPin className="text-amber-400" />
            {unmappedDevices.length} device{unmappedDevices.length > 1 ? 's' : ''} without location — click a marker to set coordinates.
          </p>
          <div className="flex flex-wrap gap-2">
            {unmappedDevices.map(d => (
              <span key={d.device_id} className="text-xs bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-slate-300 flex items-center gap-1">
                <span className={cn('w-2 h-2 rounded-full', d.online ? 'bg-emerald-400' : 'bg-red-400')} />
                {d.device_id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Device cards */}
      {devices.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <FiMapPin className="text-5xl mx-auto mb-4 text-slate-600" />
          <p>No devices registered yet</p>
        </div>
      )}
    </div>
  );
}

export default SecurityMap;
