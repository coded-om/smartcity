import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  FiActivity, FiWifi, FiCpu, FiMapPin,
  FiThermometer, FiDroplet, FiWind, FiMic,
  FiRadio, FiVideo, FiBell, FiCheckCircle, FiAlertTriangle, FiUser,
  FiArrowUp, FiArrowDown, FiTrendingUp,
} from 'react-icons/fi';
import { BsShieldExclamation, BsLightningFill } from 'react-icons/bs';
import { FaFire } from 'react-icons/fa';
import { apiFetch } from '../apiBase';
import { cn, severityBg, alertTypeIcon, formatRelative } from '../lib/utils';

const ALERT_TYPES = ['FIRE', 'GAS_LEAK', 'EXPLOSION', 'INTRUDER', 'ANOMALY'];

const TYPE_COLORS = {
  FIRE:      '#ef4444',
  GAS_LEAK:  '#f97316',
  EXPLOSION: '#a855f7',
  INTRUDER:  '#eab308',
  ANOMALY:   '#06b6d4',
};

// --- Sub-components ----------------------------------------------------------

function KpiCard({ icon, label, value, sub, colorClass, trend }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-4 bg-surface-600 rounded-2xl p-5 border border-surface-500 hover:border-primary-700 transition-colors">
      <div className={cn('flex items-center justify-center w-12 h-12 rounded-xl text-2xl', colorClass)}>
        <Icon />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      </div>
      {trend != null && (
        <div className={cn('text-sm font-bold shrink-0', trend >= 0 ? 'text-red-400' : 'text-green-400')}>
          {trend >= 0 ? <FiArrowUp /> : <FiArrowDown />}
        </div>
      )}
    </div>
  );
}

function SensorValue({ icon: Icon, label, value, unit, warn }) {
  return (
    <div className={cn('bg-surface-800 rounded-lg p-3 text-center border', warn ? 'border-orange-500/40' : 'border-surface-600')}>
      <Icon className={cn('mx-auto mb-1 text-sm', warn ? 'text-orange-400' : 'text-slate-400')} />
      <p className={cn('text-sm font-bold', warn ? 'text-orange-300' : 'text-white')}>
        {value !== undefined && value !== null ? `${value}${unit || ''}` : '—'}
      </p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function DeviceCard({ device, reading }) {
  const online = device.online === true;
  return (
    <div className={cn(
      'bg-surface-800 rounded-xl p-4 border transition-all',
      online ? 'border-surface-600' : 'border-red-900/50',
    )}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className={cn('font-semibold text-sm', online ? 'text-white' : 'text-slate-500')}>
            {device.device_id}
          </p>
          <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
            <FiMapPin className="shrink-0 text-[10px]" />
            {device.location || 'Unknown'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            online
              ? device.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30',
          )}>
            {online ? (device.status?.toUpperCase() || 'ONLINE') : 'OFFLINE'}
          </span>
          {online && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
      </div>

      <div className={cn('grid grid-cols-4 gap-2', !online && 'opacity-30')}>
        <SensorValue icon={FiThermometer} label="Temp"    value={reading?.temperature} unit="°C"
          warn={reading?.temperature > 35} />
        <SensorValue icon={FiDroplet}     label="Humid"   value={reading?.humidity}    unit="%"
          warn={reading?.humidity > 70} />
        <SensorValue icon={FiWind}        label="Gas"     value={reading?.gas}
          warn={reading?.gas > 2100} />
        <SensorValue icon={FiMic}         label="Mic"     value={reading?.mic} />
      </div>

      {device.last_seen && (
        <p className="text-slate-600 text-[10px] mt-2">
          Last seen: {formatRelative(device.last_seen)}
        </p>
      )}
    </div>
  );
}

function AlertRow({ alert }) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl border',
      alert.severity === 'CRITICAL' ? 'border-red-900/50 bg-red-950/20' :
      alert.severity === 'HIGH'     ? 'border-orange-900/50 bg-orange-950/20' :
                                      'border-surface-600 bg-surface-700',
    )}>
      <span className="text-xl">{alertTypeIcon(alert.alert_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold">{alert.alert_type}</p>
        <p className="text-slate-500 text-xs truncate">
          {alert.device_id} · {formatRelative(alert.timestamp)}
        </p>
      </div>
      <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full border shrink-0', severityBg(alert.severity))}>
        {alert.severity}
      </span>
    </div>
  );
}

// Custom tooltip for bar chart
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-xs text-white shadow-xl">
      <p className="font-bold">{label}</p>
      <p className="text-slate-300">{payload[0].value} alerts</p>
    </div>
  );
}

// --- Main component ----------------------------------------------------------

function Overview({ stats, devices, alerts, models }) {
  const [latestReadings, setLatestReadings] = useState({});
  const [analytics, setAnalytics] = useState(null);

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
      setLatestReadings(readings);
    };
    fetchReadings();
    const t = setInterval(fetchReadings, 5000);
    return () => clearInterval(t);
  }, [devices]);

  useEffect(() => {
    apiFetch('/analytics/security')
      .then(r => r.json())
      .then(d => { if (d.success) setAnalytics(d.data); })
      .catch(() => {});
  }, [alerts]);

  const criticalAlerts = (alerts || []).filter(a => a.severity === 'CRITICAL' && !a.resolved);
  const recentAlerts   = (alerts || []).slice(0, 6);
  const devicesOnline  = stats?.devices_online || 0;
  const devicesTotal   = stats?.devices_total  || 0;

  const chartData = ALERT_TYPES.map(t => ({
    type: t,
    count: (analytics?.alert_type_counts?.[t] || 0),
  }));

  const trend = analytics?.trend_24h?.change_pct;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={FiActivity}  label="Total Readings"  value={(stats?.total_readings || 0).toLocaleString()} colorClass="bg-primary-500/10 text-primary-400" />
        <KpiCard icon={FiWifi}      label="Devices Online"  value={`${devicesOnline}/${devicesTotal}`} colorClass={devicesOnline > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'} />
        <KpiCard icon={FiAlertTriangle} label="Open Alerts" value={stats?.open_alerts || 0} colorClass="bg-orange-500/10 text-orange-400" trend={trend} />
        <KpiCard icon={FiCpu}       label="AI Models"       value={models?.length || 0} sub="trained & active" colorClass="bg-purple-500/10 text-purple-400" />
      </div>

      {/* Critical banner */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-4 bg-red-950/50 border border-red-700/50 rounded-2xl p-4 animate-fade-in">
          <BsShieldExclamation className="text-red-400 text-3xl shrink-0" />
          <div>
            <p className="text-red-300 font-bold">
              {criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''} Unresolved
            </p>
            <p className="text-red-500 text-sm">Immediate action required</p>
          </div>
        </div>
      )}

      {/* Devices + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device status */}
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">Device Status</h3>
            <span className="text-xs bg-primary-500/20 text-primary-300 rounded-full px-3 py-1 border border-primary-500/20">
              {devices?.length || 0} registered
            </span>
          </div>
          <div className="p-4 space-y-3">
            {devices?.length > 0 ? devices.map(d => (
              <DeviceCard key={d.device_id} device={d} reading={latestReadings[d.device_id]} />
            )) : (
              <div className="text-center py-10 text-slate-500">
                <FiRadio className="text-4xl mx-auto mb-3 text-slate-600" />
                <p>No devices yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent alerts */}
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">Recent Alerts</h3>
            <span className="text-xs bg-orange-500/20 text-orange-300 rounded-full px-3 py-1 border border-orange-500/20">
              {stats?.open_alerts || 0} open
            </span>
          </div>
          <div className="p-4 space-y-2">
            {recentAlerts.length > 0 ? recentAlerts.map(a => (
              <AlertRow key={a.id} alert={a} />
            )) : (
              <div className="text-center py-10 text-slate-500">
                <FiCheckCircle className="text-4xl mx-auto mb-3 text-slate-600" />
                <p>No alerts detected</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alert distribution chart */}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
          <h3 className="text-white font-semibold">Alert Type Distribution</h3>
          {trend != null && (
            <span className={cn(
              'text-xs px-3 py-1 rounded-full border flex items-center gap-1',
              trend >= 0 ? 'bg-red-500/20 text-red-300 border-red-500/20' : 'bg-green-500/20 text-green-300 border-green-500/20',
            )}>
              {trend >= 0 ? <FiArrowUp /> : <FiArrowDown />}
              {Math.abs(trend)}% vs yesterday
            </span>
          )}
        </div>
        <div className="p-4" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="type" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" radius={[4,4,0,0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={TYPE_COLORS[entry.type] || '#06b6d4'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI models */}
      {models?.length > 0 && (
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">AI Models</h3>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 rounded-full px-3 py-1 border border-emerald-500/20">
              {models.length} active
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
            {models.map(model => (
              <div key={model} className="bg-surface-800 border border-surface-500 rounded-xl p-4 text-center">
                <FiCpu className="text-3xl mx-auto mb-2 text-purple-400" />
                <p className="text-white text-sm font-semibold">{model}</p>
                <p className="text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                  <FiCheckCircle /> Active
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

export default Overview;
