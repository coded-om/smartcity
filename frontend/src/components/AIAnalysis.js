import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import {
  Cpu, AlertTriangle, CheckCircle, Zap,
  RefreshCw, TrendingUp, TrendingDown, Clock,
} from 'lucide-react';
import { apiFetch } from '../apiBase';
import { severityColor } from '../lib/utils';

const SEVERITY_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#3b82f6', LOW: '#22c55e' };
const TYPE_COLORS     = { FIRE: '#ef4444', GAS_LEAK: '#f59e0b', EXPLOSION: '#f97316', INTRUDER: '#3b82f6', ANOMALY: '#8b5cf6', NORMAL: '#22c55e' };

function StatCard({ icon: Icon, label, value, sub, color }) {
  const theme = useTheme();
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ bgcolor: alpha(theme.palette[color]?.main || theme.palette.primary.main, 0.12), width: 48, height: 48, borderRadius: 3 }}>
          <Icon size={22} color={theme.palette[color]?.main || theme.palette.primary.main} />
        </Avatar>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>{label}</Typography>
          <Typography variant="h4" fontWeight={700}>{value}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
      </CardContent>
    </Card>
  );
}

function HourlyHeatmap({ data }) {
  const theme = useTheme();
  if (!data?.length) return <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>No heatmap data</Typography>;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const cells    = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: data.find(d => d.hour === h)?.count || 0 }));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 0.75 }}>
      {cells.map(({ hour, count }) => {
        const intensity = count / maxCount;
        const bg = count === 0 ? alpha(theme.palette.text.primary, 0.06)
          : intensity > 0.75 ? theme.palette.error.main
          : intensity > 0.5  ? theme.palette.warning.main
          : intensity > 0.25 ? '#f59e0b'
          : theme.palette.primary.main;
        return (
          <Box
            key={hour}
            title={`${hour}:00 — ${count} alerts`}
            sx={{ aspectRatio: '1', borderRadius: 1, bgcolor: bg, opacity: count > 0 ? 1 : 0.3, cursor: 'pointer', transition: 'transform 0.15s', '&:hover': { transform: 'scale(1.15)' }, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{hour}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function RiskGauge({ deviceId, score, totalAlerts }) {
  const color = score >= 75 ? '#ef4444' : score >= 40 ? '#f97316' : '#22c55e';
  return (
    <Box sx={{ textAlign: 'center', p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ mb: 1 }}>{deviceId}</Typography>
      <Box sx={{ position: 'relative', display: 'inline-flex', width: 80, height: 80, mb: 1 }}>
        <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e0e0e0" strokeWidth="3.8" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3.8" strokeDasharray={`${score} 100`} strokeLinecap="round" />
        </svg>
        <Typography variant="body2" fontWeight={700} sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{score}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block">{totalAlerts} alerts/24h</Typography>
    </Box>
  );
}

function AIAnalysis({ devices, models, alerts }) {
  const theme = useTheme();
  const [analytics, setAnalytics] = useState(null);
  const [training,  setTraining]  = useState({});
  const [loading,   setLoading]   = useState(true);

  const loadAnalytics = () => {
    setLoading(true);
    apiFetch('/analytics/security').then(r => r.json()).then(d => { if (d.success) setAnalytics(d.data); }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { loadAnalytics(); }, [alerts?.length]);

  const handleTrain = async (deviceId) => {
    setTraining(t => ({ ...t, [deviceId]: 'loading' }));
    try {
      const r = await apiFetch(`/train/${deviceId}`, { method: 'POST' });
      const d = await r.json();
      setTraining(t => ({ ...t, [deviceId]: d.success ? 'done' : 'error' }));
      if (d.success) loadAnalytics();
    } catch { setTraining(t => ({ ...t, [deviceId]: 'error' })); }
  };

  const totalAlerts   = alerts?.length || 0;
  const criticalCount = (alerts || []).filter(a => a.severity === 'CRITICAL').length;
  const anomalyCount  = (alerts || []).filter(a => a.alert_type === 'ANOMALY').length;
  const resolvedCount = (alerts || []).filter(a => a.resolved).length;
  const trend         = analytics?.trend_24h;

  const typeChartData = Object.entries(analytics?.alert_type_counts || {}).map(([type, count]) => ({ type, count })).filter(d => d.type !== 'NORMAL' && d.type !== 'TRAINING');
  const sevChartData  = Object.entries(analytics?.severity_counts  || {}).map(([name, value]) => ({ name, value, fill: SEVERITY_COLORS[name] || '#94a3b8' }));

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard icon={AlertTriangle} label="Total Alerts" value={totalAlerts}   color="warning" /></Grid>
        <Grid item xs={6} sm={3}><StatCard icon={Zap}           label="Critical"      value={criticalCount} color="error"   /></Grid>
        <Grid item xs={6} sm={3}><StatCard icon={Cpu}           label="AI Anomalies"  value={anomalyCount}  color="secondary" /></Grid>
        <Grid item xs={6} sm={3}><StatCard icon={CheckCircle}   label="Resolved"      value={resolvedCount} sub={`${totalAlerts - resolvedCount} open`} color="success" /></Grid>
      </Grid>

      {/* Trend */}
      {trend && (
        <Alert
          severity={(trend.change_pct || 0) >= 0 ? 'error' : 'success'}
          icon={(trend.change_pct || 0) >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          sx={{ mb: 3, fontWeight: 500 }}
        >
          {Math.abs(trend.change_pct || 0)}% {(trend.change_pct || 0) >= 0 ? 'more' : 'fewer'} alerts than yesterday — Last 24h: {trend.last_24h} · Previous: {trend.prev_24h}
        </Alert>
      )}

      {/* Charts */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title={<Typography variant="h6" fontWeight={600}>Alert Type Distribution</Typography>} />
            <CardContent sx={{ pt: 0 }}>
              <Box sx={{ height: 200 }}>
                {typeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="type" tick={{ fill: theme.palette.text.secondary, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 11 }} cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {typeChartData.map((e, i) => <Cell key={i} fill={TYPE_COLORS[e.type] || theme.palette.primary.main} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', pt: 8 }}>No data</Typography>}
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title={<Typography variant="h6" fontWeight={600}>Severity Breakdown</Typography>} />
            <CardContent sx={{ pt: 0 }}>
              <Box sx={{ height: 200 }}>
                {sevChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sevChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={4} />
                      <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: theme.palette.text.secondary }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', pt: 8 }}>No data</Typography>}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Hourly Heatmap */}
      <Card sx={{ mb: 3 }}>
        <CardHeader
          title={<Typography variant="h6" fontWeight={600}>Hourly Alert Heatmap</Typography>}
          subheader="Hour 0–23 — color intensity = alert frequency (last 7 days)"
        />
        <CardContent sx={{ pt: 0 }}><HourlyHeatmap data={analytics?.hourly_heatmap} /></CardContent>
      </Card>

      {/* Risk Scores */}
      {analytics?.risk_scores && Object.keys(analytics.risk_scores).length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardHeader title={<Typography variant="h6" fontWeight={600}>Device Risk Scores (last 24h)</Typography>} />
          <CardContent sx={{ pt: 0 }}>
            <Grid container spacing={2}>
              {Object.entries(analytics.risk_scores).map(([devId, info]) => (
                <Grid item xs={6} sm={3} key={devId}>
                  <RiskGauge deviceId={devId} score={info.score} totalAlerts={info.total_alerts} />
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Recent Clusters */}
      {analytics?.recent_clusters?.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardHeader title={<Typography variant="h6" fontWeight={600}>Recent Alert Clusters</Typography>} />
          <CardContent sx={{ pt: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {analytics.recent_clusters.map((c, i) => (
              <Chip key={i} label={`${c.type} · ${c.count} in ${c.window_minutes}min`} color={severityColor(c.severity)} size="small" variant="outlined" />
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI Models */}
      <Card>
        <CardHeader
          title={<Typography variant="h6" fontWeight={600}>AI Models</Typography>}
          action={<IconButton onClick={loadAnalytics}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></IconButton>}
        />
        <Divider />
        <CardContent>
          {(!devices || devices.length === 0) ? (
            <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>No devices registered</Typography>
          ) : (
            <Grid container spacing={2}>
              {devices.map(device => {
                const isTrained = models?.includes(device.device_id);
                const state     = training[device.device_id];
                return (
                  <Grid item xs={12} sm={6} key={device.device_id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                      <Cpu size={22} color={isTrained ? theme.palette.secondary.main : theme.palette.text.disabled} style={{ flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{device.device_id}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                          {isTrained ? <CheckCircle size={11} color={theme.palette.success.main} /> : <Clock size={11} color={theme.palette.warning.main} />}
                          <Typography variant="caption" color={isTrained ? 'success.main' : 'warning.main'}>
                            {isTrained ? 'Model trained' : 'Needs training (100 readings min)'}
                          </Typography>
                        </Box>
                      </Box>
                      <Button
                        size="small" variant="outlined"
                        color={state === 'done' ? 'success' : state === 'error' ? 'error' : 'primary'}
                        disabled={state === 'loading'}
                        onClick={() => handleTrain(device.device_id)}
                        sx={{ flexShrink: 0, minWidth: 72 }}
                      >
                        {state === 'loading' ? '…' : state === 'done' ? 'Done ✓' : state === 'error' ? 'Failed' : 'Train'}
                      </Button>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default AIAnalysis;

