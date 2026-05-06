import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  FiCpu, FiActivity, FiAlertTriangle, FiCheckCircle, FiZap,
  FiRefreshCw, FiTrendingUp, FiTrendingDown, FiArrowUp, FiArrowDown,
} from 'react-icons/fi';
import { apiFetch } from '../apiBase';
import { cn, severityBg, alertTypeIcon } from '../lib/utils';

const SEVERITY_COLORS = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#22c55e',
};

const TYPE_COLORS = {
  FIRE:      '#ef4444',
  GAS_LEAK:  '#f97316',
  EXPLOSION: '#a855f7',
  INTRUDER:  '#eab308',
  ANOMALY:   '#06b6d4',
  NORMAL:    '#22c55e',
};

function StatCard({ icon: Icon, label, value, sub, colorClass }) {
  return (
    <div className="flex items-center gap-4 bg-surface-600 rounded-2xl p-5 border border-surface-500">
      <div className={cn('flex items-center justify-center w-12 h-12 rounded-xl text-xl', colorClass)}>
        <Icon />
      </div>
      <div>
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function HourlyHeatmap({ data }) {
  if (!data?.length) return <p className="text-slate-500 text-sm text-center py-6">No heatmap data</p>;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const cells = Array.from({ length: 24 }, (_, h) => {
    const entry = data.find(d => d.hour === h);
    return { hour: h, count: entry?.count || 0 };
  });
  return (
    <div className="grid grid-cols-12 gap-1">
      {cells.map(({ hour, count }) => {
        const intensity = count / maxCount;
        const bg = count === 0
          ? 'bg-surface-700'
          : intensity > 0.75 ? 'bg-red-500'
          : intensity > 0.5  ? 'bg-orange-500'
          : intensity > 0.25 ? 'bg-yellow-500'
          : 'bg-primary-500';
        return (
          <div key={hour} title={`${hour}:00 — ${count} alerts`}
            className={cn('aspect-square rounded cursor-pointer transition-transform hover:scale-110', bg, count > 0 ? 'opacity-100' : 'opacity-30')}>
            <div className="flex items-center justify-center h-full text-[10px] text-white font-bold">
              {hour}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskGauge({ deviceId, score, totalAlerts }) {
  const color = score >= 75 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#22c55e';
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-xl p-4 text-center">
      <p className="text-xs text-slate-400 mb-2 truncate">{deviceId}</p>
      <div className="relative inline-flex items-center justify-center w-20 h-20 mb-2">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e2a3f" strokeWidth="3.8" />
          <circle cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3.8"
            strokeDasharray={`${score} 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute text-sm font-bold text-white">{score}</span>
      </div>
      <p className="text-[10px] text-slate-500">{totalAlerts} alerts / 24h</p>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-xs text-white shadow-xl">
      <p className="font-bold mb-1">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
    </div>
  );
}

// --- Main component ----------------------------------------------------------

function AIAnalysis({ devices, models, alerts }) {
  const [analytics, setAnalytics] = useState(null);
  const [training,  setTraining]  = useState({});
  const [loading,   setLoading]   = useState(true);

  const loadAnalytics = () => {
    setLoading(true);
    apiFetch('/analytics/security')
      .then(r => r.json())
      .then(d => { if (d.success) setAnalytics(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAnalytics(); }, [alerts?.length]);

  const handleTrain = async (deviceId) => {
    setTraining(t => ({ ...t, [deviceId]: 'loading' }));
    try {
      const r = await apiFetch(`/train/${deviceId}`, { method: 'POST' });
      const d = await r.json();
      setTraining(t => ({ ...t, [deviceId]: d.success ? 'done' : 'error' }));
      if (d.success) loadAnalytics();
    } catch {
      setTraining(t => ({ ...t, [deviceId]: 'error' }));
    }
  };

  const totalAlerts     = alerts?.length || 0;
  const criticalCount   = (alerts || []).filter(a => a.severity === 'CRITICAL').length;
  const anomalyCount    = (alerts || []).filter(a => a.alert_type === 'ANOMALY').length;
  const resolvedCount   = (alerts || []).filter(a => a.resolved).length;
  const trend           = analytics?.trend_24h;

  const typeChartData = Object.entries(analytics?.alert_type_counts || {})
    .map(([type, count]) => ({ type, count }))
    .filter(d => d.type !== 'NORMAL' && d.type !== 'TRAINING');

  const sevChartData = Object.entries(analytics?.severity_counts || {})
    .map(([name, value]) => ({ name, value, fill: SEVERITY_COLORS[name] || '#94a3b8' }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FiAlertTriangle} label="Total Alerts"   value={totalAlerts}    colorClass="bg-orange-500/10 text-orange-400" />
        <StatCard icon={FiZap}           label="Critical"        value={criticalCount}  colorClass="bg-red-500/10 text-red-400" />
        <StatCard icon={FiCpu}           label="AI Anomalies"    value={anomalyCount}   colorClass="bg-purple-500/10 text-purple-400" />
        <StatCard icon={FiCheckCircle}   label="Resolved"        value={resolvedCount}  sub={`${totalAlerts - resolvedCount} open`} colorClass="bg-emerald-500/10 text-emerald-400" />
      </div>

      {/* 24h Trend Banner */}
      {trend && (
        <div className={cn(
          'flex items-center gap-4 rounded-2xl p-4 border',
          (trend.change_pct || 0) >= 0
            ? 'bg-red-950/30 border-red-700/30'
            : 'bg-emerald-950/30 border-emerald-700/30',
        )}>
          {(trend.change_pct || 0) >= 0
            ? <FiTrendingUp className="text-red-400 text-2xl shrink-0" />
            : <FiTrendingDown className="text-emerald-400 text-2xl shrink-0" />}
          <div>
            <p className={cn('font-bold', (trend.change_pct || 0) >= 0 ? 'text-red-300' : 'text-emerald-300')}>
              {Math.abs(trend.change_pct || 0)}% {(trend.change_pct || 0) >= 0 ? 'more' : 'fewer'} alerts than yesterday
            </p>
            <p className="text-slate-500 text-sm">
              Last 24h: {trend.last_24h} alerts · Previous 24h: {trend.prev_24h} alerts
            </p>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alert type bar chart */}
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">Alert Type Distribution</h3>
          </div>
          <div className="p-4" style={{ height: 220 }}>
            {typeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="type" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" radius={[4,4,0,0]}>
                    {typeChartData.map((e, i) => <Cell key={i} fill={TYPE_COLORS[e.type] || '#06b6d4'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-sm text-center pt-10">No data</p>
            )}
          </div>
        </div>

        {/* Severity pie chart */}
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">Severity Breakdown</h3>
          </div>
          <div className="p-4" style={{ height: 220 }}>
            {sevChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sevChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={4} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-sm text-center pt-10">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* Hourly heatmap */}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-500">
          <h3 className="text-white font-semibold">Hourly Alert Heatmap (last 7 days)</h3>
          <p className="text-slate-500 text-xs mt-0.5">Hour 0–23. Color intensity = alert frequency.</p>
        </div>
        <div className="p-5">
          <HourlyHeatmap data={analytics?.hourly_heatmap} />
        </div>
      </div>

      {/* Device risk gauges */}
      {analytics?.risk_scores && Object.keys(analytics.risk_scores).length > 0 && (
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">Device Risk Scores (last 24h)</h3>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(analytics.risk_scores).map(([devId, info]) => (
              <RiskGauge key={devId} deviceId={devId} score={info.score} totalAlerts={info.total_alerts} />
            ))}
          </div>
        </div>
      )}

      {/* Recent event clusters */}
      {analytics?.recent_clusters?.length > 0 && (
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">Recent Event Clusters</h3>
          </div>
          <div className="p-4 space-y-2">
            {analytics.recent_clusters.map((c, i) => (
              <div key={i} className={cn('flex items-center gap-4 px-4 py-3 rounded-xl border',
                c.max_severity === 'CRITICAL' ? 'border-red-900/50 bg-red-950/20' :
                c.max_severity === 'HIGH'     ? 'border-orange-900/50 bg-orange-950/20' : 'border-surface-500 bg-surface-700')}>
                <div className="text-2xl font-bold text-slate-400 shrink-0 w-8 text-center">{c.event_count}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {c.types.map(t => <span key={t} className="text-xs bg-surface-800 border border-surface-500 rounded px-1.5 py-0.5 text-slate-300">{t}</span>)}
                  </div>
                  <p className="text-slate-500 text-xs truncate">{c.devices.join(', ')} · {c.start?.split('T')[0]}</p>
                </div>
                <span className={cn('text-xs font-bold px-2 py-1 rounded border shrink-0', severityBg(c.max_severity))}>
                  {c.max_severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Models & Training */}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
          <h3 className="text-white font-semibold">AI Models</h3>
          <button onClick={loadAnalytics} className="text-slate-400 hover:text-white transition-colors">
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {devices?.map(device => {
            const isTrained = models?.includes(device.device_id);
            const state     = training[device.device_id];
            return (
              <div key={device.device_id} className="bg-surface-700 border border-surface-500 rounded-xl p-4 flex items-center gap-4">
                <FiCpu className={cn('text-2xl shrink-0', isTrained ? 'text-purple-400' : 'text-slate-600')} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{device.device_id}</p>
                  <p className={cn('text-xs mt-0.5', isTrained ? 'text-emerald-400' : 'text-yellow-400')}>
                    {isTrained ? '✅ Model trained' : '⏳ Needs training (100 readings min)'}
                  </p>
                </div>
                <button
                  onClick={() => handleTrain(device.device_id)}
                  disabled={state === 'loading'}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg border font-medium transition-all shrink-0',
                    state === 'loading' ? 'border-slate-600 text-slate-500 cursor-wait' :
                    state === 'done'    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' :
                    state === 'error'   ? 'border-red-500/40 bg-red-500/10 text-red-300' :
                                         'border-primary-500/40 bg-primary-500/10 text-primary-300 hover:bg-primary-500/20',
                  )}
                >
                  {state === 'loading' ? '…' : state === 'done' ? 'Done ✓' : state === 'error' ? 'Failed' : 'Train'}
                </button>
              </div>
            );
          })}
          {(!devices || devices.length === 0) && (
            <p className="text-slate-500 text-sm col-span-2 text-center py-6">No devices registered</p>
          )}
        </div>
      </div>

    </div>
  );
}

export default AIAnalysis;
