import React from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import {
  FiCpu, FiActivity, FiAlertTriangle, FiCheckCircle, FiZap, FiClock,
} from 'react-icons/fi';
import { AiOutlinePartition } from 'react-icons/ai';

const SEVERITY_COLOR = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#22c55e',
};

const ALGO_PARAMS = [
  { label: 'Contamination', value: '0.05', desc: 'Expected anomaly rate'           },
  { label: 'Estimators',    value: '100',  desc: 'Random forest trees'             },
  { label: 'Features',      value: '5',    desc: 'Temp · Hum · Gas · Mic · Motion' },
];

// --- Sub-components ----------------------------------------------------------

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className={`flex items-center gap-4 bg-[#1e2535] rounded-2xl p-5 border border-[#252d3d]`}>
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl text-xl ${color}`}>
        <Icon />
      </div>
      <div>
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-white text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function ModelCard({ model }) {
  return (
    <div className="flex items-center gap-4 bg-[#161b27] rounded-xl p-4 border border-[#252d3d]">
      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 text-2xl">
        <FiCpu />
      </div>
      <div className="flex-1">
        <p className="text-white font-semibold text-sm">{model}</p>
        <p className="text-slate-500 text-xs mt-0.5">Isolation Forest · contamination=0.05</p>
      </div>
      <FiCheckCircle className="text-emerald-400 text-xl shrink-0" />
    </div>
  );
}

function DeviceAICard({ device, models, alerts }) {
  const hasModel  = models?.includes(device.device_id);
  const devAlerts = (alerts || []).filter(a => a.device_id === device.device_id);
  const sevCount  = devAlerts.reduce((acc, a) => {
    acc[a.severity] = (acc[a.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={`bg-[#161b27] rounded-2xl p-5 border-2 ${
      hasModel ? 'border-emerald-700' : 'border-[#252d3d]'
    }`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-white font-bold text-sm">{device.device_id}</p>
          <p className="text-slate-500 text-xs mt-0.5">{device.location || 'Unknown'}</p>
        </div>
        {hasModel
          ? <FiCheckCircle className="text-emerald-400 text-2xl" />
          : <FiClock className="text-yellow-400 text-2xl" />
        }
      </div>

      <div className="bg-[#0f1117] rounded-xl p-3 mb-3">
        <p className="text-xs text-slate-500 mb-1">Model</p>
        <p className={`text-sm font-bold flex items-center gap-1 ${hasModel ? 'text-emerald-400' : 'text-yellow-400'}`}>
          {hasModel
            ? <><FiCheckCircle /> Isolation Forest Trained</>
            : <><FiAlertTriangle /> Not Trained</>
          }
        </p>
      </div>

      <div className="bg-[#0f1117] rounded-xl p-3 mb-3">
        <p className="text-xs text-slate-500 mb-2">Severity Breakdown</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(sevCount).map(([sev, cnt]) => (
            <span
              key={sev}
              className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: SEVERITY_COLOR[sev] || '#6b7280' }}
            >
              {sev} ×{cnt}
            </span>
          ))}
          {devAlerts.length === 0 && (
            <span className="text-slate-600 text-xs">No alerts</span>
          )}
        </div>
      </div>

      <div className="bg-[#0f1117] rounded-xl p-3">
        <p className="text-xs text-slate-500 mb-1">Total Alerts</p>
        <p className="text-2xl font-bold text-blue-400">{devAlerts.length}</p>
      </div>
    </div>
  );
}

function AlgoParamCard({ label, value, desc }) {
  return (
    <div className="bg-[#161b27] rounded-xl p-4">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className="text-blue-400 text-2xl font-bold">{value}</p>
      <p className="text-slate-600 text-xs mt-1">{desc}</p>
    </div>
  );
}

// --- Main component ----------------------------------------------------------

function AIAnalysis({ devices, models, alerts }) {
  const anomalyAlerts = (alerts || []).filter(a => a.ai_score && a.ai_score > 0);
  const avgScore = anomalyAlerts.length
    ? (anomalyAlerts.reduce((sum, a) => sum + a.ai_score, 0) / anomalyAlerts.length).toFixed(4)
    : 'N/A';

  const alertTypeCount = (alerts || []).reduce((acc, a) => {
    acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
    return acc;
  }, {});
  const chartTypes  = Object.keys(alertTypeCount);
  const chartCounts = Object.values(alertTypeCount);

  return (
    <div className="space-y-6">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FiZap}             label="AI Models"   value={models?.length || 0} color="text-purple-400 bg-purple-500/10" />
        <StatCard icon={FiAlertTriangle}   label="Anomalies"   value={anomalyAlerts.length} color="text-orange-400 bg-orange-500/10" />
        <StatCard icon={FiActivity}        label="Avg Score"   value={avgScore}             color="text-blue-400 bg-blue-500/10" />
        <StatCard icon={AiOutlinePartition} label="Alert Types" value={chartTypes.length}   color="text-emerald-400 bg-emerald-500/10" />
      </div>

      {/* Trained Models + Alert Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#252d3d]">
            <h3 className="text-white font-semibold">Trained Models</h3>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 rounded-full px-3 py-1">
              {models?.length || 0} Active
            </span>
          </div>
          <div className="p-4 space-y-3">
            {models?.length > 0 ? (
              models.map(m => <ModelCard key={m} model={m} />)
            ) : (
              <div className="text-center py-10 text-slate-500">
                <FiCpu className="text-4xl mx-auto mb-3 text-slate-600" />
                <p>No models trained yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#252d3d]">
            <h3 className="text-white font-semibold">Alert Distribution</h3>
          </div>
          <div className="p-4">
            {chartTypes.length > 0 ? (
              <BarChart
                xAxis={[{
                  scaleType: 'band',
                  data: chartTypes,
                  tickLabelStyle: { fill: '#94a3b8', fontSize: 10 },
                }]}
                yAxis={[{
                  tickLabelStyle: { fill: '#94a3b8', fontSize: 11 },
                }]}
                series={[{ data: chartCounts, color: '#a855f7', label: 'Alerts' }]}
                height={230}
                sx={{
                  '.MuiChartsAxis-line':    { stroke: '#252d3d' },
                  '.MuiChartsAxis-tick':    { stroke: '#252d3d' },
                  '.MuiChartsLegend-label': { fill: '#94a3b8' },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                No data yet
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Per-Device AI Status */}
      <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#252d3d]">
          <h3 className="text-white font-semibold">Device AI Status</h3>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices?.map(device => (
            <DeviceAICard
              key={device.device_id}
              device={device}
              models={models}
              alerts={alerts}
            />
          ))}
        </div>
      </div>

      {/* Isolation Forest Algorithm Info */}
      <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#252d3d]">
          <AiOutlinePartition className="text-purple-400 text-xl" />
          <h3 className="text-white font-semibold">Isolation Forest Algorithm</h3>
          <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-400 rounded-full px-3 py-1">
            Active
          </span>
        </div>
        <div className="p-5">
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Unsupervised anomaly detection that isolates outliers by randomly partitioning
            the feature space. Anomalies are isolated faster with fewer splits — ideal for
            real-time IoT security monitoring.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {ALGO_PARAMS.map(p => (
              <AlgoParamCard key={p.label} {...p} />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

export default AIAnalysis;
