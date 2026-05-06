import React, { useState, useRef } from 'react';
import {
  FiPrinter, FiDownload, FiRefreshCw, FiFileText, FiAlertTriangle,
  FiActivity, FiCpu, FiPlus, FiMinus,
} from 'react-icons/fi';
import { apiFetch } from '../apiBase';
import { cn, severityBg, alertTypeIcon, formatTimestamp } from '../lib/utils';

// ── Print CSS (injected into <head> once) ─────────────────────────────────
const PRINT_STYLE = `
@media print {
  body > *:not(#print-root) { display: none !important; }
  #print-root { display: block !important; }
  #print-root { font-family: Arial, sans-serif; color: #111; background: white; }
  .page-break { page-break-before: always; }
  .no-print   { display: none !important; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 11px; }
  th { background: #f3f4f6; font-weight: bold; }
}
`;

let printStyleInjected = false;
function ensurePrintStyle() {
  if (printStyleInjected) return;
  const style = document.createElement('style');
  style.id = 'report-print-css';
  style.textContent = PRINT_STYLE;
  document.head.appendChild(style);
  printStyleInjected = true;
}

// ── Report templates ────────────────────────────────────────────────────────

const TEMPLATES = [
  { id: 'daily',       icon: FiActivity,      label: 'Daily Summary',       desc: 'KPIs, device status, recent alerts' },
  { id: 'full-alerts', icon: FiAlertTriangle,  label: 'Full Alert Report',   desc: 'Complete alert log with all details' },
  { id: 'devices',     icon: FiFileText,       label: 'Device Performance',  desc: 'Per-device stats and model status' },
  { id: 'ai',          icon: FiCpu,            label: 'AI Analysis Report',  desc: 'Model insights, anomaly trends, risk scores' },
];

// ── Preview components ──────────────────────────────────────────────────────

function ReportHeader({ title, generatedAt }) {
  return (
    <div style={{ borderBottom: '2px solid #1d4ed8', paddingBottom: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
            SmartCity Security Dashboard
          </h1>
          <h2 style={{ fontSize: 14, color: '#475569', margin: '4px 0 0' }}>{title}</h2>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
          <p style={{ margin: 0 }}>Generated: {generatedAt}</p>
          <p style={{ margin: 0 }}>Classification: CONFIDENTIAL</p>
        </div>
      </div>
    </div>
  );
}

function SummaryGrid({ summary }) {
  const items = [
    { label: 'Total Readings',   value: summary?.total_readings  || 0, color: '#1d4ed8' },
    { label: 'Total Alerts',     value: summary?.total_alerts    || 0, color: '#dc2626' },
    { label: 'Critical Alerts',  value: summary?.critical_alerts || 0, color: '#b91c1c' },
    { label: 'Total Devices',    value: summary?.total_devices   || 0, color: '#059669' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ border: `2px solid ${color}`, borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 24, fontWeight: 'bold', color, margin: 0 }}>{value?.toLocaleString()}</p>
          <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

function AlertsTable({ alerts }) {
  return (
    <table>
      <thead>
        <tr>
          {['#', 'Device', 'Type', 'Severity', 'AI Score', 'Timestamp', 'Status'].map(h => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(alerts || []).slice(0, 100).map(a => (
          <tr key={a.id}>
            <td>{a.id}</td>
            <td>{a.device_id}</td>
            <td>{alertTypeIcon(a.alert_type)} {a.alert_type}</td>
            <td style={{ color:
              a.severity === 'CRITICAL' ? '#dc2626' :
              a.severity === 'HIGH'     ? '#ea580c' :
              a.severity === 'MEDIUM'   ? '#ca8a04' : '#16a34a' }}>
              {a.severity}
            </td>
            <td style={{ fontFamily: 'monospace' }}>{a.ai_score?.toFixed(4) ?? '—'}</td>
            <td>{formatTimestamp(a.timestamp)}</td>
            <td style={{ color: a.resolved ? '#16a34a' : '#dc2626' }}>
              {a.resolved ? 'Resolved' : 'Open'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DevicesTable({ devices }) {
  return (
    <table>
      <thead>
        <tr>
          {['Device ID', 'Location', 'Status', 'Model', 'Lat', 'Lng', 'Last Seen'].map(h => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(devices || []).map(d => (
          <tr key={d.device_id}>
            <td>{d.device_id}</td>
            <td>{d.location || '—'}</td>
            <td>{d.status}</td>
            <td>{d.model_path ? '✅ Trained' : '⏳ Pending'}</td>
            <td style={{ fontFamily: 'monospace' }}>{d.lat ?? '—'}</td>
            <td style={{ fontFamily: 'monospace' }}>{d.lng ?? '—'}</td>
            <td>{formatTimestamp(d.last_seen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AnalyticsSection({ analytics }) {
  if (!analytics) return <p style={{ color: '#94a3b8' }}>No analytics data</p>;
  return (
    <div>
      <h3 style={{ fontSize: 14, color: '#1e293b', marginBottom: 10 }}>Alert Distribution</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {Object.entries(analytics.alert_type_counts || {}).map(([type, count]) => (
          <div key={type} style={{ background: '#f1f5f9', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
            <strong>{type}</strong>: {count}
          </div>
        ))}
      </div>
      <h3 style={{ fontSize: 14, color: '#1e293b', marginBottom: 8 }}>24h Trend</h3>
      <p style={{ fontSize: 12, color: '#475569' }}>
        Last 24h: {analytics.trend_24h?.last_24h ?? 0} alerts ·
        Previous 24h: {analytics.trend_24h?.prev_24h ?? 0} alerts ·
        Change: {analytics.trend_24h?.change_pct ?? 0}%
      </p>
      {Object.keys(analytics.risk_scores || {}).length > 0 && (
        <>
          <h3 style={{ fontSize: 14, color: '#1e293b', marginTop: 12, marginBottom: 8 }}>Risk Scores (last 24h)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(analytics.risk_scores).map(([devId, info]) => (
              <div key={devId} style={{ background: info.score >= 75 ? '#fee2e2' : info.score >= 40 ? '#fef3c7' : '#d1fae5', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                <strong>{devId}</strong>: {info.score}/100
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function buildReportHtml(templateId, data, generatedAt) {
  const { summary, alerts, devices, analytics } = data;

  let content = '';
  if (templateId === 'daily') {
    content = `
      <h3 style="font-size:14px;color:#1e293b;margin-bottom:8px">System Summary</h3>
      <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
        <tr><td>Total Readings</td><td>${summary?.total_readings?.toLocaleString() || 0}</td></tr>
        <tr><td>Total Alerts</td><td>${summary?.total_alerts || 0}</td></tr>
        <tr><td>Critical Alerts</td><td>${summary?.critical_alerts || 0}</td></tr>
        <tr><td>Total Devices</td><td>${summary?.total_devices || 0}</td></tr>
      </tbody></table>
    `;
  } else if (templateId === 'full-alerts') {
    content = (alerts || []).slice(0, 100).map(a => `
      <tr>
        <td>${a.id}</td><td>${a.device_id}</td><td>${a.alert_type}</td>
        <td>${a.severity}</td><td style="font-family:monospace">${a.ai_score?.toFixed(4) ?? '—'}</td>
        <td>${formatTimestamp(a.timestamp)}</td><td>${a.resolved ? 'Resolved' : 'Open'}</td>
      </tr>`).join('');
    content = `<table><thead><tr><th>#</th><th>Device</th><th>Type</th><th>Severity</th><th>Score</th><th>Time</th><th>Status</th></tr></thead><tbody>${content}</tbody></table>`;
  } else if (templateId === 'devices') {
    content = (devices || []).map(d => `
      <tr><td>${d.device_id}</td><td>${d.location || '—'}</td><td>${d.status}</td>
          <td>${d.model_path ? 'Trained' : 'Pending'}</td>
          <td>${d.lat ?? '—'}</td><td>${d.lng ?? '—'}</td>
          <td>${formatTimestamp(d.last_seen)}</td></tr>`).join('');
    content = `<table><thead><tr><th>Device</th><th>Location</th><th>Status</th><th>Model</th><th>Lat</th><th>Lng</th><th>Last Seen</th></tr></thead><tbody>${content}</tbody></table>`;
  } else if (templateId === 'ai') {
    const typeRows = Object.entries(analytics?.alert_type_counts || {}).map(([t, c]) => `<tr><td>${t}</td><td>${c}</td></tr>`).join('');
    content = `
      <h3 style="font-size:14px;color:#1e293b;margin:16px 0 8px">Alert Type Distribution</h3>
      <table><thead><tr><th>Type</th><th>Count</th></tr></thead><tbody>${typeRows}</tbody></table>
      <h3 style="font-size:14px;color:#1e293b;margin:16px 0 8px">24h Trend</h3>
      <p style="font-size:12px">Last 24h: ${analytics?.trend_24h?.last_24h ?? 0} · Previous: ${analytics?.trend_24h?.prev_24h ?? 0} · Change: ${analytics?.trend_24h?.change_pct ?? 0}%</p>
    `;
  }

  return `<!DOCTYPE html><html><head>
    <style>
      body{font-family:Arial,sans-serif;color:#111;background:white;padding:20px}
      table{border-collapse:collapse;width:100%;margin-bottom:16px}
      th,td{border:1px solid #ddd;padding:6px 10px;font-size:11px;text-align:left}
      th{background:#f3f4f6;font-weight:bold}
      h1{font-size:20px;margin:0}h2{font-size:14px;color:#475569;margin:4px 0 0}
      .header{display:flex;justify-content:space-between;border-bottom:2px solid #1d4ed8;padding-bottom:12px;margin-bottom:20px}
      .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
      .kpi{border:2px solid #1d4ed8;border-radius:8px;padding:12px;text-align:center}
      .kpi-num{font-size:22px;font-weight:bold;color:#1d4ed8}
      .kpi-lbl{font-size:11px;color:#64748b}
    </style></head><body>
    <div class="header">
      <div><h1>SmartCity Security Dashboard</h1><h2>${TEMPLATES.find(t => t.id === templateId)?.label || 'Report'}</h2></div>
      <div style="text-align:right;font-size:11px;color:#94a3b8"><p>Generated: ${generatedAt}</p><p>CONFIDENTIAL</p></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-num">${summary?.total_readings?.toLocaleString() || 0}</div><div class="kpi-lbl">Total Readings</div></div>
      <div class="kpi"><div class="kpi-num" style="color:#dc2626">${summary?.total_alerts || 0}</div><div class="kpi-lbl">Total Alerts</div></div>
      <div class="kpi"><div class="kpi-num" style="color:#b91c1c">${summary?.critical_alerts || 0}</div><div class="kpi-lbl">Critical</div></div>
      <div class="kpi"><div class="kpi-num" style="color:#059669">${summary?.total_devices || 0}</div><div class="kpi-lbl">Devices</div></div>
    </div>
    ${content}
  </body></html>`;
}

// ── Main component ──────────────────────────────────────────────────────────

function ReportCenter() {
  const [selectedTemplate, setSelectedTemplate] = useState('daily');
  const [copies,     setCopies]   = useState(1);
  const [loading,    setLoading]  = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error,      setError]    = useState(null);
  const previewRef = useRef(null);

  const template = TEMPLATES.find(t => t.id === selectedTemplate);

  const loadReport = async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch('/report/data');
      const d = await r.json();
      if (d.success) setReportData(d.data);
      else setError(d.error || 'Failed to load report data');
    } catch (e) {
      setError('Could not connect to backend');
    }
    setLoading(false);
  };

  const handlePrint = () => {
    if (!reportData) return;
    ensurePrintStyle();
    const html = buildReportHtml(selectedTemplate, reportData, new Date().toLocaleString());

    // Open in new window for printing
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      for (let i = 0; i < copies; i++) {
        win.print();
      }
    };
  };

  const generatedAt = reportData?.generated_at
    ? new Date(reportData.generated_at).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Template selector */}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4">Select Report Template</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TEMPLATES.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={cn(
                  'flex flex-col items-center text-center gap-2 p-4 rounded-xl border transition-all',
                  selectedTemplate === t.id
                    ? 'bg-primary-500/20 border-primary-500/40 text-primary-300'
                    : 'bg-surface-700 border-surface-500 text-slate-400 hover:border-slate-400 hover:text-white',
                )}
              >
                <Icon className="text-xl" />
                <p className="text-xs font-semibold">{t.label}</p>
                <p className="text-[10px] text-slate-500 leading-tight">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Print controls */}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Copies:</span>
            <div className="flex items-center gap-2 bg-surface-700 border border-surface-500 rounded-xl">
              <button onClick={() => setCopies(c => Math.max(1, c - 1))}
                className="p-2 text-slate-400 hover:text-white transition-colors">
                <FiMinus className="text-xs" />
              </button>
              <span className="text-white text-sm font-bold w-8 text-center">{copies}</span>
              <button onClick={() => setCopies(c => Math.min(10, c + 1))}
                className="p-2 text-slate-400 hover:text-white transition-colors">
                <FiPlus className="text-xs" />
              </button>
            </div>
          </div>

          <button
            onClick={loadReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-700 border border-surface-500 text-slate-300 hover:text-white transition-colors text-sm"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
            Load Data
          </button>

          <button
            onClick={handlePrint}
            disabled={!reportData || loading}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-xl border text-sm font-medium transition-all',
              reportData
                ? 'bg-primary-500/20 border-primary-500/40 text-primary-300 hover:bg-primary-500/30'
                : 'bg-surface-700 border-surface-500 text-slate-500 cursor-not-allowed',
            )}
          >
            <FiPrinter />
            Print {copies > 1 ? `(${copies} copies)` : ''}
          </button>
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>

      {/* Preview */}
      {reportData ? (
        <div className="bg-white rounded-2xl border border-surface-400 overflow-hidden shadow-xl">
          <div className="bg-surface-700 border-b border-surface-500 px-5 py-3 flex items-center justify-between no-print">
            <p className="text-slate-300 text-sm font-medium">Preview — {template?.label}</p>
            <span className="text-xs text-slate-500">Scroll to see full report</span>
          </div>
          <div
            ref={previewRef}
            id="print-root"
            style={{ padding: 24, fontFamily: 'Arial, sans-serif', color: '#111', maxHeight: 600, overflowY: 'auto' }}
          >
            <ReportHeader title={template?.label} generatedAt={generatedAt} />
            <SummaryGrid summary={reportData.summary} />

            {selectedTemplate === 'daily' && (
              <div>
                <h3 style={{ fontSize: 14, color: '#1e293b', marginBottom: 10 }}>Recent Alerts</h3>
                <AlertsTable alerts={reportData.alerts?.slice(0, 20)} />
              </div>
            )}
            {selectedTemplate === 'full-alerts' && <AlertsTable alerts={reportData.alerts} />}
            {selectedTemplate === 'devices' && <DevicesTable devices={reportData.devices} />}
            {selectedTemplate === 'ai' && <AnalyticsSection analytics={reportData.analytics} />}
          </div>
        </div>
      ) : (
        <div className="bg-surface-600 border border-surface-500 rounded-2xl flex flex-col items-center justify-center py-20 text-slate-500">
          <FiPrinter className="text-5xl mb-4 text-slate-600" />
          <p className="text-lg font-medium mb-2">No report loaded</p>
          <p className="text-sm">Click <strong className="text-slate-400">Load Data</strong> to fetch the latest report data from the backend.</p>
        </div>
      )}
    </div>
  );
}

export default ReportCenter;
