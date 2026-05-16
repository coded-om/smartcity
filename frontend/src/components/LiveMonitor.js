import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from 'recharts';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import {
  Thermometer, Droplets, Wind, Mic, Move, Cpu,
  Radio, Camera,
} from 'lucide-react';
import Hls from 'hls.js';
import { apiFetch, getApiBase, getHlsStreamUrl } from '../apiBase';
import { alertTypeIcon } from '../lib/utils';

const SENSOR_META = [
  { key: 'temperature', label: 'Temperature', unit: '°C',  Icon: Thermometer, warnAt: 35,   critAt: 55,   max: 80,   color: '#ef4444' },
  { key: 'humidity',    label: 'Humidity',    unit: '%',   Icon: Droplets,     warnAt: 70,   critAt: 90,   max: 100,  color: '#1565C0' },
  { key: 'gas',         label: 'Gas (MQ-2)',  unit: '',    Icon: Wind,         warnAt: 2100, critAt: 3000, max: 4095, color: '#f59e0b' },
  { key: 'mic',         label: 'Microphone',  unit: '',    Icon: Mic,          warnAt: 800,  critAt: 3500, max: 4095, color: '#8b5cf6' },
];

const HISTORY_MAX = 60;

function SensorGauge({ meta, value }) {
  const theme = useTheme();
  const { label, unit, Icon, warnAt, critAt, max, color } = meta;
  const pct      = Math.min(100, Math.round(((value || 0) / max) * 100));
  const isDanger = value >= critAt;
  const isWarn   = !isDanger && value >= warnAt;
  const gaugeColor = isDanger ? theme.palette.error.main : isWarn ? theme.palette.warning.main : color;

  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, p: 2,
        borderRadius: 3, border: '1px solid',
        borderColor: isDanger ? 'error.light' : isWarn ? 'warning.light' : 'divider',
        bgcolor: isDanger ? alpha(theme.palette.error.main, 0.06) : isWarn ? alpha(theme.palette.warning.main, 0.06) : 'background.default',
        transition: 'all 0.3s',
      }}
    >
      <Box sx={{ position: 'relative', width: 100, height: 100 }}>
        <RadialBarChart
          width={100} height={100} cx={50} cy={50}
          innerRadius={32} outerRadius={46}
          startAngle={90} endAngle={-270}
          data={[{ value: 100, fill: alpha(gaugeColor, 0.1) }, { value: pct, fill: gaugeColor }]}
        >
          <RadialBar dataKey="value" cornerRadius={6} />
        </RadialBarChart>
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={12} color={gaugeColor} />
          <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
            {value != null ? `${value}${unit}` : '—'}
          </Typography>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{label}</Typography>
      <Chip
        label={isDanger ? 'CRITICAL' : isWarn ? 'WARNING' : 'NORMAL'}
        color={isDanger ? 'error' : isWarn ? 'warning' : 'success'}
        size="small"
        sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }}
      />
    </Box>
  );
}

function DevicePanel({ device }) {
  const theme = useTheme();
  const [reading,  setReading]  = useState(null);
  const [history,  setHistory]  = useState([]);
  const [camState, setCamState] = useState('idle');
  const [diagOpen, setDiagOpen] = useState(false);
  const [diag,     setDiag]     = useState(null);
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  const devId = device.device_id;

  useEffect(() => {
    const fetch = async () => {
      try {
        const r = await apiFetch(`/latest/${devId}`);
        const d = await r.json();
        if (d.success && d.data) {
          setReading(d.data);
          setHistory(prev => {
            const next = [...prev, { ...d.data, t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }];
            return next.slice(-HISTORY_MAX);
          });
        }
      } catch {}
    };
    fetch();
    const t = setInterval(fetch, 5000);
    return () => clearInterval(t);
  }, [devId]);

  useEffect(() => {
    const url = getHlsStreamUrl(devId);
    if (!url || !videoRef.current) return;
    setCamState('loading');
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { videoRef.current?.play(); setCamState('ok'); });
      hls.on(Hls.Events.ERROR, () => setCamState('error'));
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = url;
      setCamState('ok');
    } else {
      setCamState('error');
    }
    return () => { hlsRef.current?.destroy(); };
  }, [devId]);

  const loadDiagnostics = async () => {
    try {
      const r = await apiFetch(`/cameras/${devId}/diagnostics`);
      const d = await r.json();
      setDiag(d.data);
    } catch {}
    setDiagOpen(v => !v);
  };

  const online = device.online === true;

  return (
    <Card>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: online ? 'success.main' : 'error.main', flexShrink: 0 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>{devId}</Typography>
            <Typography variant="caption" color="text.secondary">{device.location || 'Unknown'}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {reading?.alert_type && reading.alert_type !== 'NORMAL' && alertTypeIcon(reading.alert_type, 16)}
          <Chip label={online ? 'ONLINE' : 'OFFLINE'} color={online ? 'success' : 'error'} size="small" variant="outlined" sx={{ fontSize: '0.6rem' }} />
        </Box>
      </Box>

      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        {/* Sensor gauges */}
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {SENSOR_META.map(meta => (
            <Grid item xs={6} sm={3} key={meta.key}>
              <SensorGauge meta={meta} value={reading?.[meta.key]} />
            </Grid>
          ))}
        </Grid>

        {/* Motion + AI Score */}
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: reading?.motion ? 'warning.light' : 'divider', bgcolor: reading?.motion ? alpha(theme.palette.warning.main, 0.08) : 'background.default' }}>
              <Move size={20} color={reading?.motion ? theme.palette.warning.main : theme.palette.text.disabled} />
              <Box>
                <Typography variant="caption" color="text.secondary">Motion</Typography>
                <Typography variant="body2" fontWeight={600} color={reading?.motion ? 'warning.main' : 'text.primary'}>{reading?.motion ? 'Detected' : 'Clear'}</Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Cpu size={20} color={theme.palette.secondary.main} />
              <Box>
                <Typography variant="caption" color="text.secondary">AI Score</Typography>
                <Typography variant="body2" fontWeight={600}>{reading?.ai_score != null ? reading.ai_score.toFixed(4) : 'Training…'}</Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>

        {/* Trend chart */}
        {history.length >= 3 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Live Trends (last {history.length} readings)</Typography>
            <Box sx={{ height: 120, mt: 0.5 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 2, right: 4, left: -30, bottom: 0 }}>
                  <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: theme.palette.text.disabled, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey="temperature" stroke="#ef4444" dot={false} strokeWidth={1.5} name="Temp" />
                  <Line type="monotone" dataKey="humidity"    stroke="#1565C0" dot={false} strokeWidth={1.5} name="Humid" />
                  <Line type="monotone" dataKey="gas"         stroke="#f59e0b" dot={false} strokeWidth={1.5} name="Gas" />
                  <Line type="monotone" dataKey="mic"         stroke="#8b5cf6" dot={false} strokeWidth={1.5} name="Mic" />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        )}

        {/* Camera feed */}
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Camera size={14} color={theme.palette.text.secondary} />
              <Typography variant="caption" color="text.secondary">Camera Feed</Typography>
            </Box>
            <Button size="small" variant="text" onClick={loadDiagnostics} sx={{ fontSize: '0.7rem', py: 0 }}>Diagnostics</Button>
          </Box>
          {camState === 'ok' ? (
            <Box component="video" ref={videoRef} muted playsInline controls sx={{ width: '100%', bgcolor: '#000', maxHeight: 240, display: 'block' }} />
          ) : (
            <Box sx={{ bgcolor: 'black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, gap: 1 }}>
              <Camera size={30} color="#666" />
              <Typography variant="caption" color="text.disabled">
                {camState === 'loading' ? 'Connecting to camera…' : 'No camera configured'}
              </Typography>
              {camState === 'error' && (
                <Button
                  size="small" color="primary"
                  onClick={async () => {
                    const base = await getApiBase();
                    const url = `${base}/api/cameras/${devId}/snapshot`;
                    if (videoRef.current) videoRef.current.src = url;
                    setCamState('ok');
                  }}
                  sx={{ fontSize: '0.7rem' }}
                >
                  Try snapshot
                </Button>
              )}
            </Box>
          )}
          <Collapse in={diagOpen && !!diag}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: 'background.default' }}>
              {diag && Object.entries(diag).map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                  <Typography variant="caption" color="text.secondary">{k}</Typography>
                  <Typography variant="caption">{String(v)}</Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      </CardContent>
    </Card>
  );
}

function LiveMonitor({ devices }) {
  const [selectedId, setSelectedId] = useState(null);

  const allDevices = devices || [];
  const selected   = selectedId ? allDevices.find(d => d.device_id === selectedId) : null;
  const displayed  = selected ? [selected] : allDevices;

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Device filter tabs */}
      {allDevices.length > 1 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <Chip
            label="All Devices"
            onClick={() => setSelectedId(null)}
            color={!selectedId ? 'primary' : 'default'}
            variant={!selectedId ? 'filled' : 'outlined'}
            clickable
          />
          {allDevices.map(d => (
            <Chip
              key={d.device_id}
              label={d.device_id}
              onClick={() => setSelectedId(d.device_id)}
              color={selectedId === d.device_id ? 'primary' : 'default'}
              variant={selectedId === d.device_id ? 'filled' : 'outlined'}
              clickable
              avatar={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: d.online ? 'success.main' : 'error.main', ml: '6px !important' }} />}
            />
          ))}
        </Box>
      )}

      {displayed.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Radio size={44} color="#ccc" />
          <Typography variant="body2" color="text.disabled" mt={1}>No devices found</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {displayed.map(d => (
            <Grid item xs={12} xl={displayed.length > 1 ? 6 : 12} key={d.device_id}>
              <DevicePanel device={d} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

export default LiveMonitor;

