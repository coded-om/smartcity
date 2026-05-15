import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Activity, Wifi, Cpu, MapPin,
  Thermometer, Droplets, Wind, Mic,
  Radio, CheckCircle, AlertTriangle,
  ArrowUp, ArrowDown, ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '../apiBase';
import { cn, severityBg, alertTypeIcon, formatRelative } from '../lib/utils';

const ALERT_TYPES = ['FIRE', 'GAS_LEAK', 'EXPLOSION', 'INTRUDER', 'ANOMALY'];

const TYPE_COLORS = {
  FIRE:      '#e56b6f',
  GAS_LEAK:  '#eaac8b',
  EXPLOSION: '#b56576',
  INTRUDER:  '#6d597a',
  ANOMALY:   '#355070',
};

function KpiCard({ icon, label, value, sub, colorClass, trend }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-4 bg-surface-600 rounded-2xl p-5 border border-surface-500 hover:border-primary-500/40 hover:shadow-card-hover transition-all duration-200">
      <div className={cn('flex items-center justify-center w-12 h-12 rounded-xl', colorClass)}>
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
      </div>
      {trend != null && (
        <div className={cn('text-sm font-bold shrink-0', trend >= 0 ? 'text-coral-400' : 'text-emerald-400')}>
          {trend >= 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
        </div>
      )}
    </div>
  );
}

function SensorValue({ icon: Icon, label, value, unit, warn }) {
  return (
    <div className={cn('bg-surface-800 rounded-lg p-3 text-center border', warn ? 'border-coral-500/40' : 'border-surface-600')}>
      <Icon size={13} className={cn('mx-auto mb-1', warn ? 'text-coral-400' : 'text-slate-400')} />
      <p className={cn('text-sm font-bold', warn ? 'text-coral-300' : 'text-white')}>
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
      online ? 'border-surface-500' : 'border-accent-900/50',
    )}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className={cn('font-semibold text-sm', online ? 'text-white' : 'text-slate-500')}>
            {device.device_id}
          </p>
          <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
            <MapPin size={10} className="shrink-0" />
            {device.location || 'Unknown'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            online
              ? device.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-bronze-500/20 text-bronze-400 border-bronze-500/30'
              : 'bg-accent-500/20 text-accent-400 border-accent-500/30',
          )}>
            {online ? (device.status?.toUpperCase() || 'ONLINE') : 'OFFLINE'}
          </span>
          {online && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
      </div>

      <div className={cn('grid grid-cols-4 gap-2', !online && 'opacity-30')}>
        <SensorValue icon={Thermometer} label="Temp"  value={reading?.temperature} unit="°C" warn={reading?.temperature > 35} />
        <SensorValue icon={Droplets}    label="Humid" value={reading?.humidity}    unit="%"  warn={reading?.humidity > 70} />
        <SensorValue icon={Wind}        label="Gas"   value={reading?.gas}               warn={reading?.gas > 2100} />
        <SensorValue icon={Mic}         label="Mic"   value={reading?.mic} />
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
      alert.severity === 'CRITICAL' ? 'border-accent-900/60 bg-accent-950/20' :
      alert.severity === 'HIGH'     ? 'border-coral-900/50 bg-coral-950/20' :
                                      'border-surface-600 bg-surface-700',
    )}>
      <div className="shrink-0">{alertTypeIcon(alert.alert_type)}</div>
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

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-xs text-white shadow-xl">
      <p className="font-bold">{label}</p>
      <p className="text-slate-300">{payload[0].value} alerts</p>
    </div>
  );
}

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

      {}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Activity}       label="Total Readings"  value={(stats?.total_readings || 0).toLocaleString()} colorClass="bg-primary-500/15 text-primary-300" />
        <KpiCard icon={Wifi}           label="Devices Online"  value={`${devicesOnline}/${devicesTotal}`} colorClass={devicesOnline > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-accent-500/10 text-accent-400'} />
        <KpiCard icon={AlertTriangle}  label="Open Alerts"     value={stats?.open_alerts || 0} colorClass="bg-coral-500/10 text-coral-400" trend={trend} />
        <KpiCard icon={Cpu}            label="AI Models"       value={models?.length || 0} sub="trained &amp; active" colorClass="bg-secondary-500/10 text-secondary-300" />
      </div>

      {}
      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-4 bg-accent-900/40 border border-accent-600/50 rounded-2xl p-4 animate-fade-in">
          <ShieldAlert size={28} className="text-accent-400 shrink-0" />
          <div>
            <p className="text-accent-200 font-bold">
              {criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''} Unresolved
            </p>
            <p className="text-accent-400 text-sm">Immediate action required</p>
          </div>
        </div>
      )}

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {}
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
                <Radio size={36} className="mx-auto mb-3 text-slate-600" />
                <p>No devices yet</p>
              </div>
            )}
          </div>
        </div>

        {}
        <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
            <h3 className="text-white font-semibold">Recent Alerts</h3>
            <span className="text-xs bg-coral-500/20 text-coral-300 rounded-full px-3 py-1 border border-coral-500/20">
              {stats?.open_alerts || 0} open
            </span>
          </div>
          <div className="p-4 space-y-2">
            {recentAlerts.length > 0 ? recentAlerts.map(a => (
              <AlertRow key={a.id} alert={a} />
            )) : (
              <div className="text-center py-10 text-slate-500">
                <CheckCircle size={36} className="mx-auto mb-3 text-slate-600" />
                <p>No alerts detected</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-500">
          <h3 className="text-white font-semibold">Alert Type Distribution</h3>
          {trend != null && (
            <span className={cn(
              'text-xs px-3 py-1 rounded-full border flex items-center gap-1',
              trend >= 0 ? 'bg-coral-500/20 text-coral-300 border-coral-500/20' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20',
            )}>
              {trend >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
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

      {}
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
                <Cpu size={28} className="mx-auto mb-2 text-secondary-300" />
                <p className="text-white text-sm font-semibold">{model}</p>
                <p className="text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                  <CheckCircle size={11} /> Active
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
