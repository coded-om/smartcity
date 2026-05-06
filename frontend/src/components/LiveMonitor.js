import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Legend,
} from 'recharts';
import {
  FiThermometer, FiDroplet, FiWind, FiMic, FiMove, FiCpu,
  FiAlertTriangle, FiCheckCircle, FiRadio, FiCamera, FiRefreshCw,
} from 'react-icons/fi';
import Hls from 'hls.js';
import { apiFetch, getApiBase, getHlsStreamUrl } from '../apiBase';
import { cn, severityBg, alertTypeIcon, formatRelative } from '../lib/utils';

const SENSOR_META = [
  { key: 'temperature', label: 'Temperature', unit: '°C',  Icon: FiThermometer, warnAt: 35,   critAt: 55,   max: 80,   color: '#ef4444' },
  { key: 'humidity',    label: 'Humidity',    unit: '%',   Icon: FiDroplet,     warnAt: 70,   critAt: 90,   max: 100,  color: '#3b82f6' },
  { key: 'gas',         label: 'Gas (MQ-2)',  unit: '',    Icon: FiWind,        warnAt: 2100, critAt: 3000, max: 4095, color: '#f97316' },
  { key: 'mic',         label: 'Microphone',  unit: '',    Icon: FiMic,         warnAt: 800,  critAt: 3500, max: 4095, color: '#a855f7' },
];

const HISTORY_MAX = 60; // data points kept per sensor

function SensorGauge({ meta, value }) {
  const { label, unit, Icon, warnAt, critAt, max, color } = meta;
  const pct     = Math.min(100, Math.round(((value || 0) / max) * 100));
  const isDanger = value >= critAt;
  const isWarn   = !isDanger && value >= warnAt;
  const gaugeColor = isDanger ? '#ef4444' : isWarn ? '#f59e0b' : color;

  const data = [{ name: label, value: pct, fill: gaugeColor }];

  return (
    <div className={cn(
      'bg-surface-600 border rounded-2xl p-4 flex flex-col items-center transition-all',
      isDanger ? 'border-red-500/40 shadow-glow-red' :
      isWarn   ? 'border-amber-500/40 shadow-glow-amber' : 'border-surface-500',
    )}>
      <div className="relative w-28 h-28">
        <RadialBarChart
          width={112} height={112}
          cx={56} cy={56}
          innerRadius={36} outerRadius={50}
          startAngle={90} endAngle={-270}
          data={[{ value: 100, fill: '#1e2a3f' }, { value: pct, fill: gaugeColor }]}
        >
          <RadialBar dataKey="value" cornerRadius={6} />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon style={{ color: gaugeColor }} className="text-sm mb-0.5" />
          <p className="text-white text-xs font-bold leading-none">
            {value !== undefined && value !== null ? `${value}${unit}` : '—'}
          </p>
        </div>
      </div>
      <p className="text-slate-400 text-xs mt-1">{label}</p>
      <span className={cn(
        'text-[10px] font-bold px-2 py-0.5 rounded-full mt-1',
        isDanger ? 'bg-red-500/20 text-red-300' :
        isWarn   ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300',
      )}>
        {isDanger ? 'CRITICAL' : isWarn ? 'WARNING' : 'NORMAL'}
      </span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-xs text-white shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

function DevicePanel({ device }) {
  const [reading,  setReading]  = useState(null);
  const [history,  setHistory]  = useState([]);
  const [camState, setCamState] = useState('idle'); // idle | loading | ok | error
  const [diagOpen, setDiagOpen] = useState(false);
  const [diag,     setDiag]     = useState(null);
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  const devId = device.device_id;

  // Poll latest reading
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
    const t = setInterval(fetch, 2000);
    return () => clearInterval(t);
  }, [devId]);

  // HLS camera setup
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
    <div className="bg-surface-700 border border-surface-500 rounded-2xl overflow-hidden">
      {/* Device header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-500 bg-surface-800">
        <div className="flex items-center gap-3">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', online ? 'bg-emerald-400 animate-pulse' : 'bg-red-500')} />
          <div>
            <p className="text-white font-semibold text-sm">{devId}</p>
            <p className="text-slate-500 text-xs">{device.location || 'Unknown'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reading?.alert_type && reading.alert_type !== 'NORMAL' && (
            <span className="text-sm">{alertTypeIcon(reading.alert_type)}</span>
          )}
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            online ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30',
          )}>
            {online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Sensor gauges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SENSOR_META.map(meta => (
            <SensorGauge key={meta.key} meta={meta} value={reading?.[meta.key]} />
          ))}
        </div>

        {/* Motion + AI score row */}
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(
            'flex items-center gap-3 rounded-xl p-3 border',
            reading?.motion ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-surface-600 border-surface-500',
          )}>
            <FiMove className={reading?.motion ? 'text-yellow-400 text-xl' : 'text-slate-500 text-xl'} />
            <div>
              <p className="text-slate-400 text-xs">Motion</p>
              <p className={cn('text-sm font-bold', reading?.motion ? 'text-yellow-300' : 'text-slate-300')}>
                {reading?.motion ? 'Detected' : 'Clear'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface-600 border border-surface-500 rounded-xl p-3">
            <FiCpu className="text-purple-400 text-xl" />
            <div>
              <p className="text-slate-400 text-xs">AI Score</p>
              <p className="text-sm font-bold text-purple-300">
                {reading?.ai_score != null ? reading.ai_score.toFixed(4) : 'Training…'}
              </p>
            </div>
          </div>
        </div>

        {/* Trend chart */}
        {history.length >= 3 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Live Trends (last {history.length} readings)</p>
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 2, right: 4, left: -30, bottom: 0 }}>
                  <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="temperature" stroke="#ef4444" dot={false} strokeWidth={1.5} name="Temp" />
                  <Line type="monotone" dataKey="humidity"    stroke="#3b82f6" dot={false} strokeWidth={1.5} name="Humid" />
                  <Line type="monotone" dataKey="gas"         stroke="#f97316" dot={false} strokeWidth={1.5} name="Gas" />
                  <Line type="monotone" dataKey="mic"         stroke="#a855f7" dot={false} strokeWidth={1.5} name="Mic" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Camera panel */}
        <div className="border border-surface-500 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-surface-500">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <FiCamera /> Camera Feed
            </div>
            <button onClick={loadDiagnostics} className="text-xs text-slate-500 hover:text-white transition-colors">
              Diagnostics
            </button>
          </div>
          {camState === 'ok' ? (
            <video ref={videoRef} className="w-full bg-black" muted playsInline controls style={{ maxHeight: 240 }} />
          ) : (
            <div className="bg-black/60 flex flex-col items-center justify-center py-10 gap-2">
              <FiCamera className="text-slate-600 text-3xl" />
              <p className="text-slate-600 text-xs">
                {camState === 'loading' ? 'Connecting to camera…' : 'No camera configured'}
              </p>
              {camState === 'error' && (
                <button
                  onClick={async () => {
                    const base = await getApiBase();
                    const url = `${base}/api/cameras/${devId}/snapshot`;
                    if (videoRef.current) videoRef.current.src = url;
                    setCamState('ok');
                  }}
                  className="text-xs text-primary-400 hover:text-primary-300"
                >
                  Try snapshot
                </button>
              )}
            </div>
          )}
          {diagOpen && diag && (
            <div className="bg-surface-900 px-4 py-3 text-xs space-y-1">
              {Object.entries(diag).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-300">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main component ----------------------------------------------------------

function LiveMonitor({ devices }) {
  const [selectedId, setSelectedId] = useState(null);

  const allDevices = devices || [];
  const selected   = selectedId ? allDevices.find(d => d.device_id === selectedId) : null;
  const displayed  = selected ? [selected] : allDevices;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Device filter tabs */}
      {allDevices.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedId(null)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
              !selectedId ? 'bg-primary-500/20 text-primary-300 border-primary-500/30' : 'bg-surface-600 text-slate-400 border-surface-500 hover:text-white',
            )}
          >
            All Devices
          </button>
          {allDevices.map(d => (
            <button
              key={d.device_id}
              onClick={() => setSelectedId(d.device_id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2',
                selectedId === d.device_id ? 'bg-primary-500/20 text-primary-300 border-primary-500/30' : 'bg-surface-600 text-slate-400 border-surface-500 hover:text-white',
              )}
            >
              <span className={cn('w-2 h-2 rounded-full shrink-0', d.online ? 'bg-emerald-400' : 'bg-red-500')} />
              {d.device_id}
            </button>
          ))}
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <FiRadio className="text-5xl mx-auto mb-4 text-slate-600" />
          <p>No devices found</p>
        </div>
      ) : (
        <div className={cn('grid gap-6', displayed.length > 1 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>
          {displayed.map(d => <DevicePanel key={d.device_id} device={d} />)}
        </div>
      )}
    </div>
  );
}

export default LiveMonitor;
