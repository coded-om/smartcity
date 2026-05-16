import React, { useState, useEffect, useRef } from 'react';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { alpha, keyframes } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, AreaChart, Area,
} from 'recharts';
import {
  Activity, Wifi, Cpu, MapPin, Radio,
  Thermometer, Droplets, Wind, Mic, Move,
  CheckCircle, ArrowUp, ArrowDown, ShieldAlert, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../apiBase';
import { alertTypeIcon, severityColor, formatRelative } from '../lib/utils';
import getSocket from '../socketClient';

const ALERT_TYPES = ['FIRE', 'GAS_LEAK', 'EXPLOSION', 'INTRUDER', 'ANOMALY'];
const TYPE_COLORS = {
  FIRE: '#ef4444', GAS_LEAK: '#f59e0b', EXPLOSION: '#f97316',
  INTRUDER: '#3b82f6', ANOMALY: '#8b5cf6',
};

const T = { tempWarn: 35, tempMax: 60, humWarn: 70, humMax: 100, gasWarn: 2100, gasMax: 4095, micMax: 4095 };

const pulse = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
  70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
`;

function KpiCard({ icon: Icon, label, value, sub, color, trend }) {
  const theme = useTheme();
  const c = theme.palette[color]?.main || theme.palette.primary.main;
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '20px !important' }}>
        <Avatar sx={{ bgcolor: alpha(c, 0.12), width: 48, height: 48, borderRadius: 3 }}>
          <Icon size={22} color={c} />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2, fontSize: '0.65rem' }}>{label}</Typography>
          <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.3 }}>{value}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
        {trend != null && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: trend >= 0 ? 'error.main' : 'success.main' }}>
            {trend >= 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
            <Typography variant="caption" fontWeight={700} sx={{ ml: 0.25 }}>{Math.abs(trend).toFixed(1)}%</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function CircleGauge({ value, max, warn, label, unit, icon: Icon, size = 72 }) {
  const theme = useTheme();
  const pct    = Math.min(100, ((value ?? 0) / max) * 100);
  const isWarn = (value ?? 0) >= warn;
  const color  = isWarn ? theme.palette.error.main : theme.palette.primary.main;
  const r      = (size - 10) / 2;
  const circ   = 2 * Math.PI * r;
  const dash   = circ * (pct / 100);
  const gap    = circ - dash;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={alpha(color, 0.12)} strokeWidth={8} />
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
        <Box sx={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <Icon size={12} color={color} />
          <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.65rem', color, lineHeight: 1.1, mt: 0.25 }}>
            {value ?? '\u2014'}
          </Typography>
          {unit && <Typography variant="caption" sx={{ fontSize: '0.5rem', color: 'text.disabled', lineHeight: 1 }}>{unit}</Typography>}
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', textAlign: 'center' }}>{label}</Typography>
    </Box>
  );
}

function SensorBar({ value, max, warn, label, icon: Icon }) {
  const theme  = useTheme();
  const pct    = Math.min(100, ((value ?? 0) / max) * 100);
  const isWarn = (value ?? 0) >= warn;
  const color  = isWarn ? 'error' : 'primary';
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Icon size={10} color={isWarn ? theme.palette.error.main : theme.palette.text.secondary} />
          <Typography variant="caption" sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{label}</Typography>
        </Box>
        <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.62rem', color: isWarn ? 'error.main' : 'text.primary' }}>
          {value ?? '\u2014'}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ height: 5, borderRadius: 4, bgcolor: alpha(isWarn ? theme.palette.error.main : theme.palette.primary.main, 0.1) }}
      />
    </Box>
  );
}

function Sparkline({ data, field, color }) {
  if (!data?.length) return null;
  const pts = data.slice(-20).map((r, i) => ({ i, v: r[field] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${field}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#sp-${field})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DeviceSensorCard({ device, reading, history }) {
  const theme  = useTheme();
  const online = device.online === true;
  const [flash, setFlash] = useState(false);
  const prevTs = useRef(null);

  useEffect(() => {
    const ts = reading?.timestamp;
    if (!ts || ts === prevTs.current) return;
    prevTs.current = ts;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [reading?.timestamp]);

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderColor: flash ? 'success.main' : online ? alpha(theme.palette.success.main, 0.3) : 'divider',
        transition: 'border-color 0.6s',
        animation: flash ? `${pulse} 1s ease-out` : 'none',
      }}
    >
      <CardContent sx={{ p: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(online ? theme.palette.success.main : theme.palette.action.disabled, 0.15), borderRadius: 1.5 }}>
            <Radio size={16} color={online ? theme.palette.success.main : theme.palette.text.disabled} />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} noWrap>{device.device_id}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MapPin size={9} color={theme.palette.text.disabled} />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }} noWrap>
                {device.location || 'Unknown'}
              </Typography>
            </Box>
          </Box>
          <Chip
            label={online ? 'ONLINE' : 'OFFLINE'}
            color={online ? 'success' : 'default'}
            size="small"
            variant={online ? 'filled' : 'outlined'}
            sx={{ fontSize: '0.55rem', height: 18, fontWeight: 700 }}
          />
        </Box>

        {reading ? (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 1.5 }}>
              <CircleGauge value={reading.temperature} max={T.tempMax} warn={T.tempWarn}
                label="Temp" unit="\u00b0C" icon={Thermometer} />
              <CircleGauge value={reading.humidity} max={T.humMax} warn={T.humWarn}
                label="Humid" unit="%" icon={Droplets} />
              <Tooltip title={reading.motion ? 'Motion Detected' : 'No Motion'}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
                  <Avatar sx={{
                    width: 40, height: 40,
                    bgcolor: reading.motion ? alpha(theme.palette.error.main, 0.15) : alpha(theme.palette.action.disabled, 0.1),
                    animation: reading.motion ? `${pulse} 1.5s infinite` : 'none',
                  }}>
                    <Move size={18} color={reading.motion ? theme.palette.error.main : theme.palette.text.disabled} />
                  </Avatar>
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: reading.motion ? 'error.main' : 'text.disabled' }}>
                    {reading.motion ? 'MOTION' : 'quiet'}
                  </Typography>
                </Box>
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
              <SensorBar value={reading.gas} max={T.gasMax} warn={T.gasWarn} label="Gas / Air Quality" icon={Wind} />
              <SensorBar value={reading.mic} max={T.micMax} warn={T.micMax * 0.7} label="Microphone / Noise" icon={Mic} />
            </Box>

            {reading.ai_score != null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, p: '4px 8px', borderRadius: 2,
                bgcolor: alpha(reading.alert_type !== 'NORMAL' ? theme.palette.warning.main : theme.palette.success.main, 0.08) }}>
                <Zap size={11} color={reading.alert_type !== 'NORMAL' ? theme.palette.warning.main : theme.palette.success.main} />
                <Typography variant="caption" sx={{ fontSize: '0.62rem', fontWeight: 600 }}>
                  AI: {reading.alert_type}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', ml: 'auto' }}>
                  score {Number(reading.ai_score).toFixed(3)}
                </Typography>
              </Box>
            )}

            {history?.length > 2 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.58rem' }}>
                  Gas trend (last {Math.min(history.length, 20)} readings)
                </Typography>
                <Sparkline data={history} field="gas" color={theme.palette.warning.main} />
              </Box>
            )}

            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.58rem', display: 'block', mt: 0.5 }}>
              Updated: {formatRelative(reading.timestamp)}
            </Typography>
          </>
        ) : (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">No recent data</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function AlertListItem({ alert }) {
  return (
    <ListItem divider sx={{ px: 2, py: 1.25, alignItems: 'flex-start' }}>
      <ListItemAvatar sx={{ minWidth: 32, mt: 0.25 }}>
        {alertTypeIcon(alert.alert_type, 16)}
      </ListItemAvatar>
      <ListItemText
        primary={<Typography variant="body2" fontWeight={500}>{alert.alert_type}</Typography>}
        secondary={<Typography variant="caption" color="text.secondary">{alert.device_id} \u00b7 {formatRelative(alert.timestamp)}</Typography>}
      />
      <Chip label={alert.severity} color={severityColor(alert.severity)} size="small" variant="filled" sx={{ mt: 0.5, fontSize: '0.6rem', fontWeight: 700 }} />
    </ListItem>
  );
}

export default function Overview({ stats, devices, alerts, models }) {
  const theme = useTheme();
  const [latestReadings, setLatestReadings] = useState({});
  const [sensorHistory,  setSensorHistory]  = useState({});
  const [analytics,      setAnalytics]      = useState(null);
  const seenAlerts = useRef(new Set());

  useEffect(() => {
    if (!devices?.length) return;
    const fetchReadings = async () => {
      const readings = {};
      await Promise.all(devices.map(async (device) => {
        try {
          const res  = await apiFetch(`/latest/${device.device_id}`);
          const data = await res.json();
          if (data.success) readings[device.device_id] = data.data;
        } catch {}
      }));
      setLatestReadings(prev => ({ ...prev, ...readings }));
    };
    fetchReadings();
    const t = setInterval(fetchReadings, 8000);
    return () => clearInterval(t);
  }, [devices]);

  useEffect(() => {
    let cancelled = false;
    getSocket().then((sock) => {
      if (cancelled) return;
      const handler = (data) => {
        if (!data?.device_id) return;
        setLatestReadings(prev => ({ ...prev, [data.device_id]: data }));
        setSensorHistory(prev => {
          const hist = [...(prev[data.device_id] || []), data].slice(-40);
          return { ...prev, [data.device_id]: hist };
        });
      };
      sock.on('sensor_reading', handler);
      return () => sock.off('sensor_reading', handler);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!alerts?.length) return;
    alerts.slice(0, 10).forEach(a => {
      if (seenAlerts.current.has(a.id)) return;
      seenAlerts.current.add(a.id);
      if (a.severity === 'CRITICAL') {
        toast.error(`CRITICAL: ${a.alert_type} on ${a.device_id}`, { duration: 7000, description: formatRelative(a.timestamp) });
      } else if (a.severity === 'HIGH') {
        toast.warning(`HIGH: ${a.alert_type} on ${a.device_id}`, { duration: 4000 });
      }
    });
  }, [alerts]);

  useEffect(() => {
    if (!devices?.length) return;
    devices.forEach(async (d) => {
      try {
        const res  = await apiFetch(`/readings?device=${d.device_id}&limit=40`);
        const data = await res.json();
        if (data.success && data.data?.length) {
          setSensorHistory(prev => ({ ...prev, [d.device_id]: [...data.data].reverse() }));
        }
      } catch {}
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices?.length]);

  useEffect(() => {
    apiFetch('/analytics/security').then(r => r.json()).then(d => { if (d.success) setAnalytics(d.data); }).catch(() => {});
  }, [alerts]);

  const criticalAlerts = (alerts || []).filter(a => a.severity === 'CRITICAL' && !a.resolved);
  const recentAlerts   = (alerts || []).slice(0, 8);
  const devicesOnline  = stats?.devices_online || 0;
  const devicesTotal   = stats?.devices_total  || 0;
  const trend          = analytics?.trend_24h?.change_pct;

  const chartData = ALERT_TYPES.map(t => ({
    type: t.replace('_', ' '),
    count: analytics?.alert_type_counts?.[t] || 0,
  }));

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <KpiCard icon={Activity}    label="Total Readings" value={(stats?.total_readings || 0).toLocaleString()} color="primary" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard icon={Wifi}        label="Devices Online" value={`${devicesOnline}/${devicesTotal}`} color={devicesOnline > 0 ? 'success' : 'error'} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard icon={ShieldAlert} label="Open Alerts"    value={(stats?.open_alerts || 0).toLocaleString()} color="warning" trend={trend} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard icon={Cpu}         label="AI Models"      value={models?.length || 0} sub="trained & active" color="secondary" />
        </Grid>
      </Grid>

      {criticalAlerts.length > 0 && (
        <Alert severity="error" icon={<ShieldAlert size={20} />} sx={{ mb: 3, fontWeight: 600 }}>
          {criticalAlerts.length} critical alert{criticalAlerts.length > 1 ? 's' : ''} unresolved
        </Alert>
      )}

      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h6" fontWeight={700} display="inline">Live Sensor Dashboard</Typography>
        <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
          auto-refresh \u00b7 real-time via socket
        </Typography>
      </Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {devices?.length > 0 ? devices.map(d => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={d.device_id}>
            <DeviceSensorCard device={d} reading={latestReadings[d.device_id]} history={sensorHistory[d.device_id]} />
          </Grid>
        )) : (
          <Grid item xs={12}>
            <Box sx={{ py: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
              <Radio size={36} color="#ccc" />
              <Typography variant="body2" color="text.disabled" mt={1}>No devices registered yet</Typography>
            </Box>
          </Grid>
        )}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title={<Typography variant="h6" fontWeight={600}>Recent Alerts</Typography>}
              action={<Chip label={`${stats?.open_alerts || 0} open`} size="small" color="warning" variant="outlined" />}
              sx={{ pb: 0, px: 2 }}
            />
            <Divider sx={{ mx: 2, mt: 1 }} />
            <List disablePadding sx={{ maxHeight: 360, overflow: 'auto' }}>
              {recentAlerts.length > 0 ? recentAlerts.map(a => (
                <AlertListItem key={a.id} alert={a} />
              )) : (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <CheckCircle size={36} color="#22c55e" />
                  <Typography variant="body2" color="text.disabled" mt={1}>No alerts detected</Typography>
                </Box>
              )}
            </List>
          </Card>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title={<Typography variant="h6" fontWeight={600}>Alert Distribution</Typography>}
              action={
                trend != null && (
                  <Chip
                    icon={trend >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    label={`${Math.abs(trend).toFixed(1)}% vs yesterday`}
                    color={trend >= 0 ? 'error' : 'success'}
                    variant="outlined"
                    size="small"
                  />
                )
              }
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ pt: 1 }}>
              <Box sx={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="type" tick={{ fill: theme.palette.text.secondary, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <ReTooltip
                      contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 }}
                      cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={TYPE_COLORS[ALERT_TYPES[i]] || theme.palette.primary.main} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {models?.length > 0 && (
        <Card>
          <CardHeader
            title={<Typography variant="h6" fontWeight={600}>AI Models</Typography>}
            action={<Chip label={`${models.length} active`} size="small" color="success" variant="outlined" />}
          />
          <CardContent sx={{ pt: 0 }}>
            <Grid container spacing={1.5}>
              {models.map(model => (
                <Grid item xs={6} sm={4} md={3} key={model}>
                  <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', textAlign: 'center',
                    bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                    <Cpu size={24} color={theme.palette.primary.main} style={{ marginBottom: 6 }} />
                    <Typography variant="caption" fontWeight={600} noWrap display="block">{model}</Typography>
                    <Chip label="Active" color="success" size="small" variant="outlined" sx={{ mt: 0.5, fontSize: '0.55rem', height: 16 }} />
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
