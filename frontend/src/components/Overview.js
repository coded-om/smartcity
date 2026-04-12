import React, { useState, useEffect } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import {
  FiActivity, FiWifi, FiCpu, FiMapPin,
  FiThermometer, FiDroplet, FiWind, FiMic,
  FiRadio, FiVideo, FiBell, FiCheckCircle, FiAlertTriangle, FiUser,
} from 'react-icons/fi';
import { BsShieldExclamation, BsLightningFill } from 'react-icons/bs';
import { AiFillAlert } from 'react-icons/ai';
import { FaFire } from 'react-icons/fa';

const API_URL = `http://${window.location.hostname}:5000/api`;

const SEVERITY_COLOR = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#22c55e',
};

const ALERT_ICON = {
  FIRE:      FaFire,
  GAS_LEAK:  FiWind,
  EXPLOSION: BsLightningFill,
  INTRUDER:  FiUser,
  ANOMALY:   FiAlertTriangle,
  NORMAL:    FiCheckCircle,
};

const ALERT_TYPES = ['FIRE', 'GAS_LEAK', 'EXPLOSION', 'INTRUDER', 'ANOMALY', 'NORMAL'];

// --- Sub-components ----------------------------------------------------------

function StatCard({ icon, label, value, color }) {
  return (
    <div className="flex items-center gap-4 bg-[#1e2535] rounded-2xl p-5 border border-[#252d3d]">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl text-2xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function SensorMiniCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-[#0f1117] rounded-lg py-2 text-center">
      <div className="flex justify-center text-slate-400 text-base mb-0.5">
        <Icon />
      </div>
      <p className="text-slate-500 text-[10px]">{label}</p>
      <p className="text-white text-xs font-bold">{value}</p>
    </div>
  );
}

function DeviceCard({ device, reading }) {
  const isActive = device.status === 'active';
  return (
    <div className="bg-[#161b27] rounded-xl p-4 border border-[#252d3d]">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-white font-semibold text-sm">{device.device_id}</p>
          <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
            <FiMapPin className="shrink-0" />
            {device.location || 'Unknown'}
          </p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
          isActive
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {device.status?.toUpperCase()}
        </span>
      </div>

      {reading && (
        <div className="grid grid-cols-4 gap-2">
          <SensorMiniCard icon={FiThermometer} label="Temp"     value={`${reading.temperature}°C`} />
          <SensorMiniCard icon={FiDroplet}     label="Humidity" value={`${reading.humidity}%`}     />
          <SensorMiniCard icon={FiWind}        label="Gas"      value={reading.gas}                />
          <SensorMiniCard icon={FiMic}         label="Mic"      value={reading.mic}                />
        </div>
      )}

      {device.last_seen && (
        <p className="text-slate-600 text-[10px] mt-2">
          Last seen: {new Date(device.last_seen).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function AlertRow({ alert }) {
  const Icon  = ALERT_ICON[alert.alert_type] || FiAlertTriangle;
  const color = SEVERITY_COLOR[alert.severity] || '#6b7280';

  return (
    <div className="bg-[#161b27] rounded-xl p-4 border-l-4" style={{ borderColor: color }}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xl text-slate-300">
          <Icon />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">{alert.alert_type}</p>
          <p className="text-slate-500 text-xs truncate">
            {alert.device_id} · {alert.timestamp}
          </p>
        </div>
        <span
          className="text-xs font-bold px-2 py-1 rounded-full text-white shrink-0"
          style={{ background: color }}
        >
          {alert.severity}
        </span>
      </div>

      <div className="flex gap-4 text-xs text-slate-500">
        <span>Score: {alert.ai_score?.toFixed(4)}</span>
        {alert.video_file && (
          <span className="flex items-center gap-1">
            <FiVideo /> Video
          </span>
        )}
        <span className="flex items-center gap-1">
          {alert.resolved
            ? <><FiCheckCircle className="text-emerald-400" /> Resolved</>
            : <><FiBell className="text-yellow-400" /> Open</>
          }
        </span>
      </div>
    </div>
  );
}

// --- Main component ----------------------------------------------------------

function Overview({ stats, devices, alerts, models }) {
  const [latestReadings, setLatestReadings] = useState({});

  useEffect(() => {
    if (!devices?.length) return;

    const fetchLatestReadings = async () => {
      const readings = {};
      await Promise.all(
        devices.map(async (device) => {
          try {
            const res  = await fetch(`${API_URL}/latest/${device.device_id}`);
            const data = await res.json();
            if (data.success) readings[device.device_id] = data.data;
          } catch (err) {
            console.error(`Error fetching readings for ${device.device_id}:`, err);
          }
        })
      );
      setLatestReadings(readings);
    };

    fetchLatestReadings();
    const interval = setInterval(fetchLatestReadings, 5000);
    return () => clearInterval(interval);
  }, [devices]);

  const recentAlerts   = alerts?.slice(0, 5) || [];
  const criticalAlerts = alerts?.filter(a => a.severity === 'CRITICAL' && !a.resolved) || [];
  const alertCounts    = ALERT_TYPES.map(t => (alerts || []).filter(a => a.alert_type === t).length);

  const devicesOnline = stats?.devices_online || 0;
  const devicesTotal  = stats?.devices_total  || 0;
  const onlineColor   = devicesOnline > 0
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-red-500/10 text-red-400';

  return (
    <div className="space-y-6">

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FiActivity />}
          label="Total Readings"
          value={stats?.total_readings || 0}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          icon={<FiWifi />}
          label="Devices Online"
          value={`${devicesOnline} / ${devicesTotal}`}
          color={onlineColor}
        />
        <StatCard
          icon={<AiFillAlert />}
          label="Total Alerts"
          value={stats?.total_alerts || 0}
          color="bg-orange-500/10 text-orange-400"
        />
        <StatCard
          icon={<FiCpu />}
          label="AI Models"
          value={models?.length || 0}
          color="bg-purple-500/10 text-purple-400"
        />
      </div>

      {/* Critical Banner */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-4 bg-red-950/60 border border-red-700 rounded-2xl p-5">
          <BsShieldExclamation className="text-red-400 text-3xl shrink-0" />
          <div>
            <p className="text-red-300 font-bold">
              {criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''} Active
            </p>
            <p className="text-red-500 text-sm">Immediate action required</p>
          </div>
        </div>
      )}

      {/* Device Status + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#252d3d]">
            <h3 className="text-white font-semibold">Device Status</h3>
            <span className="text-xs bg-blue-500/20 text-blue-400 rounded-full px-3 py-1">
              {devices?.length || 0} Registered
            </span>
          </div>
          <div className="p-4 space-y-3">
            {devices?.length > 0 ? (
              devices.map(device => (
                <DeviceCard
                  key={device.device_id}
                  device={device}
                  reading={latestReadings[device.device_id]}
                />
              ))
            ) : (
              <div className="text-center py-10 text-slate-500">
                <FiRadio className="text-4xl mx-auto mb-3 text-slate-600" />
                <p>No devices registered yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#252d3d]">
            <h3 className="text-white font-semibold">Recent Alerts</h3>
            <span className="text-xs bg-orange-500/20 text-orange-400 rounded-full px-3 py-1">
              {stats?.open_alerts || 0} Open
            </span>
          </div>
          <div className="p-4 space-y-3">
            {recentAlerts.length > 0 ? (
              recentAlerts.map(alert => (
                <AlertRow key={alert.id} alert={alert} />
              ))
            ) : (
              <div className="text-center py-10 text-slate-500">
                <FiCheckCircle className="text-4xl mx-auto mb-3 text-slate-600" />
                <p>No alerts detected</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Alert Type Distribution Chart */}
      <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#252d3d]">
          <h3 className="text-white font-semibold">Alert Type Distribution</h3>
        </div>
        <div className="p-4">
          <BarChart
            xAxis={[{
              scaleType: 'band',
              data: ALERT_TYPES,
              tickLabelStyle: { fill: '#94a3b8', fontSize: 11 },
            }]}
            yAxis={[{
              tickLabelStyle: { fill: '#94a3b8', fontSize: 11 },
            }]}
            series={[{ data: alertCounts, color: '#3b82f6', label: 'Alerts' }]}
            height={220}
            sx={{
              '.MuiChartsAxis-line': { stroke: '#252d3d' },
              '.MuiChartsAxis-tick': { stroke: '#252d3d' },
            }}
          />
        </div>
      </div>

      {/* AI Models */}
      {models?.length > 0 && (
        <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#252d3d]">
            <h3 className="text-white font-semibold">AI Models Trained</h3>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 rounded-full px-3 py-1">
              {models.length} Active
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
            {models.map(model => (
              <div
                key={model}
                className="bg-[#161b27] border border-[#252d3d] rounded-xl p-4 text-center"
              >
                <FiCpu className="text-3xl mx-auto mb-2 text-purple-400" />
                <p className="text-white text-sm font-semibold">{model}</p>
                <p className="text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                  <FiCheckCircle /> Trained &amp; Active
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
