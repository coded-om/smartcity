import React, { useState } from 'react';
import { FiFilter, FiDownload, FiCheckCircle, FiBell, FiVideo } from 'react-icons/fi';
import { BsShieldExclamation } from 'react-icons/bs';
import { FaFire } from 'react-icons/fa';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  FiWind, FiUser, FiAlertTriangle,
} from 'react-icons/fi';
import { BsLightningFill } from 'react-icons/bs';

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

const SEVERITIES   = ['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const TABLE_HEADERS = ['ID', 'Type', 'Device', 'Severity', 'AI Score', 'Timestamp', 'Status'];

// --- PDF document ------------------------------------------------------------

const pdfStyles = StyleSheet.create({
  page:  { padding: 30, backgroundColor: '#fff', fontFamily: 'Helvetica' },
  title: { fontSize: 18, marginBottom: 16, fontWeight: 'bold', color: '#1e293b' },
  sub:   { fontSize: 10, color: '#64748b', marginBottom: 20 },
  head:  { flexDirection: 'row', borderBottom: '2pt solid #334155', paddingVertical: 8,
           fontSize: 9, fontWeight: 'bold', color: '#334155' },
  row:   { flexDirection: 'row', borderBottom: '1pt solid #e2e8f0', paddingVertical: 6, fontSize: 9 },
  cell:  { flex: 1, paddingHorizontal: 4, color: '#334155' },
});

function AlertsPDF({ alerts }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Smart City Security — Forensic Alert Report</Text>
        <Text style={pdfStyles.sub}>
          Generated: {new Date().toLocaleString()} · Total: {alerts.length} alerts
        </Text>
        <View style={pdfStyles.head}>
          {TABLE_HEADERS.map(h => (
            <Text key={h} style={pdfStyles.cell}>{h}</Text>
          ))}
        </View>
        {alerts.map(a => (
          <View key={a.id} style={pdfStyles.row}>
            <Text style={pdfStyles.cell}>#{a.id}</Text>
            <Text style={pdfStyles.cell}>{a.alert_type}</Text>
            <Text style={pdfStyles.cell}>{a.device_id}</Text>
            <Text style={pdfStyles.cell}>{a.severity}</Text>
            <Text style={pdfStyles.cell}>{a.ai_score?.toFixed(4) ?? 'N/A'}</Text>
            <Text style={pdfStyles.cell}>{a.resolved ? 'Resolved' : 'Open'}</Text>
            <Text style={pdfStyles.cell}>{a.timestamp}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

async function exportPDF(alerts) {
  const blob = await pdf(<AlertsPDF alerts={alerts} />).toBlob();
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `forensic-report-${Date.now()}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

// --- Sub-components ----------------------------------------------------------

function AlertTypeCell({ alertType }) {
  const Icon = ALERT_ICON[alertType] || FiAlertTriangle;
  return (
    <span className="flex items-center gap-2 font-semibold text-white">
      <Icon className="shrink-0" />
      {alertType}
    </span>
  );
}

function StatusCell({ resolved, videoFile, videoUrl, onOpenVideo }) {
  return (
    <span className="flex items-center gap-2">
      {resolved
        ? <span className="flex items-center gap-1 text-emerald-400"><FiCheckCircle /> Resolved</span>
        : <span className="flex items-center gap-1 text-orange-400"><FiBell /> Open</span>
      }
      {videoFile && (
        <button
          onClick={onOpenVideo}
          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
          title="Play recording"
        >
          <FiVideo /> View
        </button>
      )}
      {!videoFile && videoUrl && (
        <button
          onClick={onOpenVideo}
          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
          title="Play recording"
        >
          <FiVideo /> View
        </button>
      )}
    </span>
  );
}

// --- Main component ----------------------------------------------------------

function ForensicLogs({ alerts }) {
  const [filter, setFilter] = useState('all');
  const [selectedVideo, setSelectedVideo] = useState(null);

  const videoSrcFor = (alert) => {
    if (alert.video_url) {
      if (alert.video_url.startsWith('http://') || alert.video_url.startsWith('https://')) {
        return alert.video_url;
      }
      return `http://${window.location.hostname}:5000${alert.video_url}`;
    }

    // Backward compatibility for old alerts that only have file path
    if (alert.video_file) {
      const filename = alert.video_file.split('/').pop();
      return `http://${window.location.hostname}:5000/api/recordings/${filename}`;
    }

    return null;
  };

  const filtered = filter === 'all'
    ? (alerts || [])
    : (alerts || []).filter(a => a.severity === filter);

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1e2535] border border-[#252d3d] rounded-2xl px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <FiFilter className="text-slate-500 shrink-0" />
          <span className="text-slate-500 text-xs font-semibold uppercase">Filter:</span>
          {SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#161b27] text-slate-400 hover:text-white border border-[#252d3d]'
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => exportPDF(filtered)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          <FiDownload /> Export PDF ({filtered.length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#252d3d]">
          <h3 className="text-white font-semibold">Alert History</h3>
          <span className="text-xs bg-blue-500/20 text-blue-400 rounded-full px-3 py-1">
            {filtered.length} Records
          </span>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#252d3d] text-slate-500 text-xs uppercase tracking-wide">
                  {TABLE_HEADERS.map(h => (
                    <th key={h} className="px-5 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(alert => (
                  <tr
                    key={alert.id}
                    className="border-b border-[#252d3d] hover:bg-[#161b27] transition-colors"
                  >
                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">#{alert.id}</td>
                    <td className="px-5 py-3">
                      <AlertTypeCell alertType={alert.alert_type} />
                    </td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{alert.device_id}</td>
                    <td className="px-5 py-3">
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
                        style={{ background: SEVERITY_COLOR[alert.severity] || '#6b7280' }}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-purple-400 font-mono text-xs">
                      {alert.ai_score?.toFixed(4) ?? 'N/A'}
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {new Date(alert.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <StatusCell
                        resolved={alert.resolved}
                        videoFile={alert.video_file}
                        videoUrl={alert.video_url}
                        onOpenVideo={() => setSelectedVideo(videoSrcFor(alert))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
            <BsShieldExclamation className="text-5xl" />
            <p className="font-semibold">No Alerts Found</p>
            <p className="text-xs">No alerts match the selected filter</p>
          </div>
        )}
      </div>

      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-[#1e2535] border border-[#252d3d] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#252d3d]">
              <h4 className="text-white font-semibold">Alert Recording</h4>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <video
                src={selectedVideo}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ForensicLogs;
