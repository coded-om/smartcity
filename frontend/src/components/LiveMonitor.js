import React, { useState, useEffect } from 'react';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  FiThermometer, FiDroplet, FiWind, FiMic, FiMove, FiCpu,
  FiAlertTriangle, FiCheckCircle, FiRadio, FiCamera, FiRefreshCw,
  FiMaximize2, FiMinimize2,
} from 'react-icons/fi';

const API_URL = `http://${window.location.hostname}:5000/api`;
const STREAM_FAILOVER_MS = 5000;

const SENSOR_META = [
  { key: 'temperature', label: 'Temperature', unit: '°C',  Icon: FiThermometer, dangerAt: v => v > 55,   color: '#ef4444' },
  { key: 'humidity',    label: 'Humidity',    unit: '%',   Icon: FiDroplet,     dangerAt: () => false,   color: '#3b82f6' },
  { key: 'gas',         label: 'Gas (MQ-2)',  unit: 'ppm', Icon: FiWind,        dangerAt: v => v > 3000, color: '#f97316' },
  { key: 'mic',         label: 'Microphone',  unit: 'dB',  Icon: FiMic,         dangerAt: v => v > 800,  color: '#a855f7' },
  { key: 'motion',      label: 'Motion',      unit: '',    Icon: FiMove,        dangerAt: v => v === 1,  color: '#eab308',
    format: v => (v ? 'Detected' : 'Clear') },
  { key: 'ai_score',    label: 'AI Score',    unit: '',    Icon: FiCpu,         dangerAt: v => v > 0,    color: '#8b5cf6',
    format: v => (v != null ? v.toFixed(4) : 'N/A') },
];

// --- Sub-components ----------------------------------------------------------

function SensorCard({ meta, value }) {
  const { label, unit, Icon, dangerAt, color, format } = meta;
  const isDanger = dangerAt(value);
  const display  = format ? format(value) : `${value}${unit}`;

  return (
    <div
      className="bg-[#1e2535] border border-[#252d3d] rounded-2xl p-5"
      style={{ borderLeftColor: isDanger ? '#ef4444' : color, borderLeftWidth: 4 }}
    >
      <div className="flex items-center gap-2 mb-3 text-slate-400 text-sm">
        <Icon style={{ color }} />
        {label}
      </div>
      <p className="text-3xl font-bold" style={{ color: isDanger ? '#ef4444' : color }}>
        {display}
      </p>
      <p className={`flex items-center gap-1 text-xs mt-2 font-semibold ${isDanger ? 'text-red-400' : 'text-emerald-400'}`}>
        {isDanger
          ? <><FiAlertTriangle /> ALERT</>
          : <><FiCheckCircle /> Normal</>
        }
      </p>
    </div>
  );
}

function MetaCard({ label, value }) {
  return (
    <div className="bg-[#161b27] rounded-xl p-4">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className="text-white text-sm font-semibold break-all">{value}</p>
    </div>
  );
}

function CameraHealthCard({ label, value, healthy = true }) {
  return (
    <div className="bg-[#161b27] rounded-xl p-4 border border-[#252d3d]">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className={`text-sm font-semibold ${healthy ? 'text-emerald-400' : 'text-red-400'}`}>
        {value}
      </p>
    </div>
  );
}

// --- Main component ----------------------------------------------------------

function LiveMonitor({ devices }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [readings,       setReadings]       = useState(null);
  const [history,        setHistory]        = useState([]);
  const [cameraTick,     setCameraTick]     = useState(Date.now());
  const [cameraError,    setCameraError]    = useState(false);
  const [cameraLoading,  setCameraLoading]  = useState(true);
  const [cameraMode,     setCameraMode]     = useState('stream');
  const [cameraOpen,     setCameraOpen]     = useState(false);
  const [cameraHealth,   setCameraHealth]   = useState(null);
  const [streamFailoverStartedAt, setStreamFailoverStartedAt] = useState(null);

  useEffect(() => {
    if (devices?.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0].device_id);
    }
  }, [devices, selectedDevice]);

  useEffect(() => {
    if (!selectedDevice) return;

    const fetchData = async () => {
      try {
        const [latestRes, histRes] = await Promise.all([
          fetch(`${API_URL}/latest/${selectedDevice}`),
          fetch(`${API_URL}/readings?device=${selectedDevice}&limit=20`),
        ]);
        const [latestData, histData] = await Promise.all([
          latestRes.json(),
          histRes.json(),
        ]);
        if (latestData.success) setReadings(latestData.data);
        if (histData.success)   setHistory((histData.data || []).reverse());
      } catch (err) {
        console.error('LiveMonitor fetch error:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedDevice) return;

    const fetchDiagnostics = async () => {
      try {
        const res = await fetch(`${API_URL}/cameras/${encodeURIComponent(selectedDevice)}/diagnostics`);
        const data = await res.json();
        if (data?.data) {
          setCameraHealth(data.data);
        }
      } catch (err) {
        console.error('Camera diagnostics fetch error:', err);
      }
    };

    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 8000);
    return () => clearInterval(interval);
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedDevice) return;

    setCameraError(false);
    setCameraLoading(true);
    setCameraTick(Date.now());
    setCameraMode('stream');
    setStreamFailoverStartedAt(null);

    const interval = setInterval(() => {
      if (cameraMode !== 'stream') {
        setCameraTick(Date.now());
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedDevice, cameraMode]);

  const tempData = history.map(r => r.temperature ?? 0);
  const gasData  = history.map(r => r.gas         ?? 0);
  const xLabels  = history.map((_, i) => i + 1);

  const metaItems = readings ? [
    { label: 'Device',    value: readings.device_id },
    { label: 'Timestamp', value: readings.timestamp },
    { label: 'AI Score',  value: readings.ai_score?.toFixed(6) ?? 'N/A' },
    { label: 'Class',     value: readings.ai_score > 0 ? 'Anomaly' : 'Normal' },
  ] : [];

  const cameraUrl = selectedDevice
    ? `${API_URL}/cameras/${encodeURIComponent(selectedDevice)}/snapshot?t=${cameraTick}`
    : null;
  const cameraStreamUrl = selectedDevice
    ? `${API_URL}/cameras/${encodeURIComponent(selectedDevice)}/stream?t=${cameraTick}`
    : null;
  const activeCameraUrl = cameraMode === 'stream' ? cameraStreamUrl : cameraUrl;

  return (
    <div className="space-y-6">

      {/* Device Selector */}
      <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl p-5">
        <p className="text-slate-500 text-xs uppercase tracking-widest mb-3 font-semibold">
          Select Device
        </p>
        <div className="flex flex-wrap gap-3">
          {devices?.map(d => (
            <button
              key={d.device_id}
              onClick={() => setSelectedDevice(d.device_id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedDevice === d.device_id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'bg-[#161b27] text-slate-400 hover:text-white border border-[#252d3d]'
              }`}
            >
              {d.device_id}
              {d.status === 'active' && (
                <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      {readings ? (
        <>
          {/* Sensor Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {SENSOR_META.map(meta => (
              <SensorCard key={meta.key} meta={meta} value={readings[meta.key]} />
            ))}
          </div>

          {/* Live Trend Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#252d3d]">
                <h3 className="text-white font-semibold">Live Trend (last 20 readings)</h3>
              </div>
              <div className="p-4">
                <LineChart
                  xAxis={[{ data: xLabels, tickLabelStyle: { fill: '#94a3b8', fontSize: 11 } }]}
                  yAxis={[{ tickLabelStyle: { fill: '#94a3b8', fontSize: 11 } }]}
                  series={[
                    { data: tempData, label: 'Temp (°C)', color: '#ef4444', curve: 'monotoneX', showMark: false },
                    { data: gasData,  label: 'Gas (ppm)', color: '#f97316', curve: 'monotoneX', showMark: false },
                  ]}
                  height={260}
                  sx={{
                    '.MuiChartsAxis-line':    { stroke: '#252d3d' },
                    '.MuiChartsAxis-tick':    { stroke: '#252d3d' },
                    '.MuiChartsLegend-label': { fill: '#94a3b8' },
                  }}
                />
              </div>
            </div>

            <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#252d3d] flex items-center justify-between gap-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <FiCamera className="text-blue-400" />
                  Live Camera
                </h3>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${
                    cameraError
                      ? 'bg-red-500/15 text-red-400'
                      : cameraMode === 'stream'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-blue-500/15 text-blue-400'
                  }`}>
                    {cameraError ? 'Offline' : cameraMode === 'stream' ? 'Live stream' : 'Preview fallback'}
                  </span>
                  <button
                    onClick={() => {
                      setCameraLoading(true);
                      setCameraError(false);
                      setCameraTick(Date.now());
                    }}
                    className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <FiRefreshCw /> Refresh
                  </button>
                  <button
                    onClick={() => setCameraOpen(true)}
                    className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <FiMaximize2 /> Fullscreen
                  </button>
                </div>
              </div>
              <div className="p-4">
                <div className="relative rounded-2xl overflow-hidden bg-[#0f1117] border border-[#252d3d] min-h-[260px] flex items-center justify-center">
                  {activeCameraUrl && !cameraError ? (
                    <>
                      {cameraLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-[#0f1117]/80 z-10">
                          <FiRefreshCw className="animate-spin text-2xl" />
                          <p className="text-sm">Loading camera {cameraMode}...</p>
                        </div>
                      )}
                      <img
                        src={activeCameraUrl}
                        alt={`Live camera for ${selectedDevice}`}
                        className="w-full h-[320px] object-cover"
                        onLoad={() => {
                          setCameraLoading(false);
                          setStreamFailoverStartedAt(null);
                        }}
                        onError={() => {
                          if (cameraMode === 'stream') {
                            const now = Date.now();
                            if (!streamFailoverStartedAt) {
                              setStreamFailoverStartedAt(now);
                              setCameraLoading(true);
                              setCameraTick(now);
                              return;
                            }

                            if ((now - streamFailoverStartedAt) < STREAM_FAILOVER_MS) {
                              setCameraLoading(true);
                              setCameraTick(now);
                              return;
                            }

                            setCameraMode('snapshot');
                            setCameraLoading(true);
                            setCameraTick(now);
                          } else {
                            setCameraLoading(false);
                            setCameraError(true);
                          }
                        }}
                      />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 px-6 text-center">
                      <FiCamera className="text-4xl" />
                      <p className="text-white font-medium">Camera preview unavailable</p>
                      <p className="text-sm">
                        No live camera snapshot is available for this device yet.
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Stream mode uses MJPEG in the browser. On temporary errors, stream retries for 5s before fallback.
                </p>

                {cameraHealth && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <CameraHealthCard
                      label="RTSP Connectivity"
                      value={cameraHealth.rtsp_connectivity ? 'Connected' : 'Failed'}
                      healthy={cameraHealth.rtsp_connectivity}
                    />
                    <CameraHealthCard
                      label="Stream Success"
                      value={cameraHealth.stream_success ? 'Ready' : 'Unavailable'}
                      healthy={cameraHealth.stream_success}
                    />
                    <CameraHealthCard
                      label="Preview Latency"
                      value={cameraHealth.response_time_ms != null ? `${cameraHealth.response_time_ms} ms` : 'N/A'}
                      healthy={cameraHealth.response_time_ms != null && cameraHealth.response_time_ms < 4000}
                    />
                  </div>
                )}

                {cameraHealth?.preview_profile && (
                  <div className="mt-3 text-xs text-slate-500">
                    Preview profile: {cameraHealth.preview_profile.width}px wide · JPEG quality {cameraHealth.preview_profile.jpeg_quality} · refresh every {cameraHealth.preview_profile.interval_seconds}s
                    {cameraHealth.snapshot_source && (
                      <span> · diagnostics source: {cameraHealth.snapshot_source}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reading Metadata */}
          <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Reading Metadata</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {metaItems.map(({ label, value }) => (
                <MetaCard key={label} label={label} value={value} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <FiRadio className="text-5xl" />
          <p className="text-lg font-semibold">No Live Data</p>
          <p className="text-sm">Waiting for device readings...</p>
        </div>
      )}

      {cameraOpen && activeCameraUrl && !cameraError && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#252d3d]">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <FiCamera className="text-blue-400" />
                Camera — {selectedDevice}
              </h4>
              <button
                onClick={() => setCameraOpen(false)}
                className="text-slate-400 hover:text-white text-sm inline-flex items-center gap-1"
              >
                <FiMinimize2 /> Close
              </button>
            </div>
            <div className="p-4 bg-black">
              <img
                src={activeCameraUrl}
                alt={`Fullscreen camera for ${selectedDevice}`}
                className="w-full max-h-[80vh] object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default LiveMonitor;
