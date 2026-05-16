import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { MapPin, Edit2 } from 'lucide-react';
import { apiFetch } from '../apiBase';
import { alertTypeIcon, formatRelative } from '../lib/utils';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl:       require('leaflet/dist/images/marker-icon.png'),
  shadowUrl:     require('leaflet/dist/images/marker-shadow.png'),
});

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
  online:  makeIcon('#1565C0'),
  offline: makeIcon('#757575'),
  alert:   makeIcon('#ef4444'),
};

const DEFAULT_CENTER = [24.7136, 46.6753];
const DEFAULT_ZOOM   = 16;

function Recenter({ devices }) {
  const map = useMap();
  useEffect(() => {
    const valid = devices.filter(d => d.lat && d.lng);
    if (valid.length === 1) { map.setView([valid[0].lat, valid[0].lng], DEFAULT_ZOOM); }
    else if (valid.length > 1) { const bounds = L.latLngBounds(valid.map(d => [d.lat, d.lng])); map.fitBounds(bounds, { padding: [60, 60] }); }
  }, [devices.length]);
  return null;
}

function DevicePopup({ device, alerts, onLocationEdit }) {
  const [editMode, setEditMode] = useState(false);
  const [lat, setLat]           = useState(String(device.lat ?? ''));
  const [lng, setLng]           = useState(String(device.lng ?? ''));
  const devAlerts               = (alerts || []).filter(a => a.device_id === device.device_id && !a.resolved).slice(0, 3);

  const saveLocation = async () => {
    const latN = parseFloat(lat), lngN = parseFloat(lng);
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
    <Box sx={{ minWidth: 200, fontFamily: 'Roboto, sans-serif' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: device.online ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
        <Typography variant="body2" fontWeight={700}>{device.device_id}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>{device.location || 'Unknown location'}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Chip label={device.online ? 'Online' : 'Offline'} color={device.online ? 'success' : 'error'} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
        {device.status && <Typography variant="caption" color="text.secondary">{device.status}</Typography>}
      </Box>
      {devAlerts.length > 0 && (
        <Box sx={{ mb: 1 }}>
          {devAlerts.map(a => (
            <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
              {alertTypeIcon(a.alert_type, 12)}
              <Typography variant="caption">{a.alert_type}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{formatRelative(a.timestamp)}</Typography>
            </Box>
          ))}
        </Box>
      )}
      <Divider sx={{ my: 1 }} />
      {editMode ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <TextField size="small" label="Latitude"  value={lat} onChange={e => setLat(e.target.value)}  inputProps={{ style: { fontSize: 12 } }} />
          <TextField size="small" label="Longitude" value={lng} onChange={e => setLng(e.target.value)} inputProps={{ style: { fontSize: 12 } }} />
          <Button size="small" variant="contained" onClick={saveLocation} sx={{ mt: 0.5, fontSize: '0.75rem' }}>Save Location</Button>
        </Box>
      ) : (
        <Button size="small" variant="text" startIcon={<Edit2 size={11} />} onClick={() => setEditMode(true)} sx={{ fontSize: '0.75rem', p: 0 }}>Edit location</Button>
      )}
    </Box>
  );
}

function SecurityMap({ devices: propDevices, alerts }) {
  const theme   = useTheme();
  const [devices, setDevices] = useState(propDevices || []);
  useEffect(() => { setDevices(propDevices || []); }, [propDevices]);

  const handleLocationEdit = (deviceId, lat, lng) => {
    setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, lat, lng } : d));
  };

  const mappableDevices = devices.filter(d => d.lat && d.lng);
  const unmappedDevices = devices.filter(d => !d.lat || !d.lng);
  const criticalDevices = new Set((alerts || []).filter(a => a.severity === 'CRITICAL' && !a.resolved).map(a => a.device_id));
  const getIcon = (d) => criticalDevices.has(d.device_id) ? ICONS.alert : d.online ? ICONS.online : ICONS.offline;

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Legend */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, py: '12px !important' }}>
          {[{ color: '#1565C0', label: 'Online' }, { color: '#9e9e9e', label: 'Offline' }, { color: '#ef4444', label: 'Active Alert' }].map(({ color, label }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {mappableDevices.length} / {devices.length} devices on map
          </Typography>
        </CardContent>
      </Card>

      {/* Map */}
      <Box sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider', mb: 2, height: '55vh', minHeight: 400 }}>
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com">CARTO</a> &copy; OpenStreetMap contributors'
          />
          <Recenter devices={mappableDevices} />
          {mappableDevices.map(d => (
            <React.Fragment key={d.device_id}>
              <Marker position={[d.lat, d.lng]} icon={getIcon(d)}>
                <Popup maxWidth={240}>
                  <DevicePopup device={d} alerts={alerts} onLocationEdit={handleLocationEdit} />
                </Popup>
              </Marker>
              {criticalDevices.has(d.device_id) && (
                <Circle center={[d.lat, d.lng]} radius={30} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.1, weight: 2 }} />
              )}
            </React.Fragment>
          ))}
        </MapContainer>
      </Box>

      {/* Unmapped devices */}
      {unmappedDevices.length > 0 && (
        <Card>
          <CardContent sx={{ py: '12px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <MapPin size={14} color={theme.palette.warning.main} />
              <Typography variant="body2" color="text.secondary">{unmappedDevices.length} device{unmappedDevices.length > 1 ? 's' : ''} without location</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {unmappedDevices.map(d => (
                <Chip key={d.device_id} label={d.device_id} size="small" color={d.online ? 'primary' : 'default'} variant="outlined" />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {devices.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <MapPin size={44} color="#ccc" style={{ margin: '0 auto 12px' }} />
          <Typography variant="body1" color="text.disabled">No devices registered yet</Typography>
        </Box>
      )}
    </Box>
  );
}

export default SecurityMap;

