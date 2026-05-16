import React, { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import { Shield, AlertOctagon, AlertTriangle, Eye, X, Wifi, WifiOff, ChevronUp, ChevronDown } from 'lucide-react';
import getSocket from '../socketClient';

const MAX_THREATS = 20;
const SEV = {
  CRITICAL: { color: 'error',   Icon: AlertOctagon },
  HIGH:     { color: 'warning', Icon: AlertTriangle },
  MEDIUM:   { color: 'info',    Icon: AlertTriangle },
};

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return '—'; }
}

function ThreatRow({ threat, onViewCamera }) {
  const theme = useTheme();
  const cfg   = SEV[threat.severity] || SEV.MEDIUM;
  const { Icon } = cfg;
  const palette  = theme.palette[cfg.color];
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 1.5, py: 1, borderRadius: 2,
        bgcolor: alpha(palette?.main || '#888', 0.08),
        border: `1px solid ${alpha(palette?.main || '#888', 0.3)}`,
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      <Icon size={14} color={palette?.main} style={{ flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" fontWeight={600} noWrap sx={{ display: 'block', color: palette?.main }}>
          {threat.threat_type?.replace('_', ' ')}
          {threat.weapon_class ? ` · ${threat.weapon_class.toUpperCase()}` : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.6rem' }}>
          {threat.camera_name || `Cam ${threat.camera_id}`} · {fmtTime(threat.timestamp)}
          {threat.confidence ? ` · ${Math.round(threat.confidence * 100)}%` : ''}
        </Typography>
      </Box>
      <Chip label={threat.severity} color={cfg.color} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }} />
      {onViewCamera && (
        <IconButton size="small" onClick={() => onViewCamera(threat.camera_id)} sx={{ p: 0.25 }}>
          <Eye size={13} />
        </IconButton>
      )}
    </Box>
  );
}

export default function ThreatMonitor({ onViewCamera }) {
  const theme = useTheme();
  const [threats,   setThreats]   = useState([]);
  const [connected, setConnected] = useState(false);
  const [expanded,  setExpanded]  = useState(true);
  const socketRef = useRef(null);

  const addThreat = useCallback((data) => {
    setThreats(prev => [{ ...data, _id: Date.now() + Math.random() }, ...prev].slice(0, MAX_THREATS));
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSocket().then((sock) => {
      if (cancelled) return;
      socketRef.current = sock;
      setConnected(sock.connected);
      sock.on('connect',    () => setConnected(true));
      sock.on('disconnect', () => setConnected(false));
      sock.on('threat_detected', addThreat);
      sock.on('weapon_detected', (data) => addThreat({
        ...data,
        threat_type: `WEAPON · ${(data.class_name || '').toUpperCase()}`,
        severity: 'CRITICAL',
        source: 'weapon',
      }));
    });
    return () => {
      cancelled = true;
      const sock = socketRef.current;
      if (sock) { sock.off('threat_detected', addThreat); sock.off('weapon_detected'); }
    };
  }, [addThreat]);

  const hasCritical = threats.some(t => t.severity === 'CRITICAL');
  const borderColor = hasCritical ? theme.palette.error.main : theme.palette.divider;

  return (
    <Box sx={{ borderBottom: `1px solid ${borderColor}`, bgcolor: 'background.paper', transition: 'border-color 0.3s' }}>
      {/* Header bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, minHeight: 40 }}>
        <Shield size={14} color={hasCritical ? theme.palette.error.main : theme.palette.text.secondary} />
        <Typography variant="caption" fontWeight={600} sx={{ color: hasCritical ? 'error.main' : 'text.secondary' }}>
          Live Threats
        </Typography>
        {threats.length > 0 && (
          <Chip label={threats.length} size="small" color={hasCritical ? 'error' : 'default'} sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }} />
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
          {connected ? <Wifi size={11} color={theme.palette.success.main} /> : <WifiOff size={11} color={theme.palette.text.disabled} />}
          <Typography variant="caption" color={connected ? 'success.main' : 'text.disabled'} sx={{ fontSize: '0.65rem' }}>
            {connected ? 'live' : 'offline'}
          </Typography>
          {threats.length > 0 && (
            <IconButton size="small" onClick={() => setThreats([])} sx={{ p: 0.25, ml: 0.5 }}>
              <X size={12} />
            </IconButton>
          )}
          <IconButton size="small" onClick={() => setExpanded(p => !p)} sx={{ p: 0.25 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </IconButton>
        </Box>
      </Box>

      {/* Threat items */}
      <Collapse in={expanded && threats.length > 0}>
        <Box sx={{ px: 2, pb: 1.5, display: 'flex', gap: 1, flexWrap: 'nowrap', overflowX: 'auto' }}>
          {threats.slice(0, 6).map(t => (
            <Box key={t._id} sx={{ minWidth: 220, maxWidth: 280, flexShrink: 0 }}>
              <ThreatRow threat={t} onViewCamera={onViewCamera} />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

