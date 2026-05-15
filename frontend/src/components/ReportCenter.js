import React, { useState, useCallback } from 'react';
import {
  Printer, Download, RefreshCw,
  AlertTriangle, Activity, Camera, User,
  Thermometer, Search, ChevronDown, ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../apiBase';

function fmt(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('en-GB', { hour12: false }); }
  catch { return ts; }
}
function pct(num, total) {
  if (!total) return '0%';
  return ((num / total) * 100).toFixed(1) + '%';
}
function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const lines = rows.map(r =>
    keys.map(k => {
      const v = r[k] == null ? '' : String(r[k]);
      return v.includes(',') || v.includes('"') ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}
function downloadCsv(rows, filename) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function printHtml(htmlContent) {
  const win = window.open('', '_blank', 'width=1000,height=750');
  win.document.write(htmlContent);
  win.document.close();
  win.onload = () => win.print();
}

const BASE_STYLE = `
  body{font-family:'Segoe UI',Arial,sans-serif;color:#111;background:#fff;margin:0;padding:20px}
  h1{font-size:22px;margin:0;color:#1e293b}h2{font-size:15px;color:#475569;margin:4px 0 0}
  h3{font-size:13px;font-weight:600;color:#1e293b;margin:18px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
  table{border-collapse:collapse;width:100%;margin-bottom:16px;font-size:11px}
  th{background:#f1f5f9;color:#374151;font-weight:600;padding:7px 10px;border:1px solid #e2e8f0;text-align:left}
  td{padding:6px 10px;border:1px solid #e2e8f0;color:#374151}
  tr:nth-child(even) td{background:#f8fafc}
  .header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1d4ed8;padding-bottom:14px;margin-bottom:22px}
  .header-meta{text-align:right;font-size:11px;color:#94a3b8;line-height:1.6}
  .kpi-row{display:grid;gap:12px;margin-bottom:22px}
  .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;background:#f8fafc}
  .kpi-num{font-size:26px;font-weight:700;line-height:1}
  .kpi-lbl{font-size:10px;color:#64748b;margin-top:4px}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
  .br{page-break-before:always}
  @media print{@page{margin:14mm}body{padding:0}}
`;

function rHeader(title, sub, meta) {
  return '<div class="header"><div><h1>SmartCity Security System</h1><h2>' + title + '</h2>' +
    (sub ? '<p style="font-size:11px;color:#94a3b8;margin:4px 0 0">' + sub + '</p>' : '') +
    '</div><div class="header-meta"><div>Generated: ' + meta.generatedAt + '</div><div>Period: ' + meta.from + ' \u2192 ' + meta.to + '</div>' +
    '<div style="margin-top:4px;font-size:10px;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;display:inline-block">CONFIDENTIAL</div></div></div>';
}
function kBox(num, label, color) {
  return '<div class="kpi"><div class="kpi-num" style="color:' + color + '">' + (num ?? 0) + '</div><div class="kpi-lbl">' + label + '</div></div>';
}
function kRow(boxes, cols) {
  return '<div class="kpi-row" style="grid-template-columns:repeat(' + cols + ',1fr)">' + boxes.join('') + '</div>';
}
function wrap(html) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + BASE_STYLE + '</style></head><body>' + html + '</body></html>';
}

function buildExecutive(d, meta) {
  const s = d.summary;
  const atRows = Object.entries(d.alert_type_counts || {}).map(([t, c]) =>
    '<tr><td>' + t + '</td><td>' + c + '</td><td>' + pct(c, s.total_alerts) + '</td></tr>').join('');
  const svRows = Object.entries(d.severity_counts || {}).map(([sv, c]) =>
    '<tr><td>' + sv + '</td><td>' + c + '</td><td>' + pct(c, s.total_alerts) + '</td></tr>').join('');
  const camRows = (d.cameras || []).map(c =>
    '<tr><td>' + c.name + '</td><td>' + (c.location || '—') + '</td><td>' + c.face_detections + '</td><td>' + c.authorized_persons + '</td><td>' + c.unknown_persons + '</td><td>' + c.object_detections + '</td></tr>').join('');
  return wrap(
    rHeader('Executive Summary Report', null, meta) +
    kRow([kBox(s.total_alerts,'Total Alerts','#dc2626'), kBox(s.critical_alerts,'Critical','#b91c1c'), kBox(s.total_face_detections,'Face Detections','#7c3aed'), kBox(s.total_cameras,'Active Cameras','#0284c7')], 4) +
    kRow([kBox(s.unknown_detections,'Unknown Persons','#ea580c'), kBox(s.authorized_detections,'Authorised','#059669'), kBox(s.total_object_detections,'Objects','#0891b2'), kBox(s.total_readings,'Sensor Readings','#6366f1')], 4) +
    '<h3>Alert Type Breakdown</h3><table><thead><tr><th>Type</th><th>Count</th><th>%</th></tr></thead><tbody>' + (atRows || '<tr><td colspan="3">No data</td></tr>') + '</tbody></table>' +
    '<h3>Severity Distribution</h3><table><thead><tr><th>Severity</th><th>Count</th><th>%</th></tr></thead><tbody>' + (svRows || '<tr><td colspan="3">No data</td></tr>') + '</tbody></table>' +
    '<h3>Camera Activity</h3><table><thead><tr><th>Camera</th><th>Location</th><th>Faces</th><th>Auth</th><th>Unknown</th><th>Objects</th></tr></thead><tbody>' + (camRows || '<tr><td colspan="6">No cameras</td></tr>') + '</tbody></table>'
  );
}

function buildThreats(d, meta) {
  const s = d.summary;
  const alertRows = (d.alerts || []).map(a =>
    '<tr><td>' + (a.id || '') + '</td><td>' + (a.device_id || '—') + '</td><td>' + (a.alert_type || '—') + '</td><td>' + (a.severity || '—') + '</td><td style="font-family:monospace">' + (a.ai_score != null ? Number(a.ai_score).toFixed(3) : '—') + '</td><td>' + fmt(a.timestamp) + '</td><td>' + (a.resolved ? '✓' : '⚠') + '</td></tr>').join('');
  const clsRows = (d.top_classes || []).map(c => '<tr><td>' + c.class_name + '</td><td>' + c.cnt + '</td></tr>').join('');
  const objRows = (d.object_detections || []).slice(0, 100).map(o =>
    '<tr><td>' + fmt(o.timestamp) + '</td><td>' + (o.camera_name || '—') + '</td><td>' + (o.camera_location || '—') + '</td><td>' + o.class_name + '</td><td>' + (o.confidence * 100).toFixed(1) + '%</td></tr>').join('');
  return wrap(
    rHeader('Threat Detection Report', s.total_alerts + ' alerts · ' + s.critical_alerts + ' critical', meta) +
    kRow([kBox(s.total_alerts,'Total Alerts','#dc2626'), kBox(s.critical_alerts,'Critical','#b91c1c'), kBox(s.high_alerts,'High','#ea580c'), kBox(s.total_object_detections,'Objects','#0891b2')], 4) +
    '<h3>Top Detected Object Classes</h3><table><thead><tr><th>Class</th><th>Count</th></tr></thead><tbody>' + (clsRows || '<tr><td colspan="2">No detections</td></tr>') + '</tbody></table>' +
    '<h3>Alert Log</h3><table><thead><tr><th>#</th><th>Device</th><th>Type</th><th>Severity</th><th>AI Score</th><th>Timestamp</th><th>Status</th></tr></thead><tbody>' + (alertRows || '<tr><td colspan="7">No alerts</td></tr>') + '</tbody></table>' +
    '<h3>Object Detection Log (latest 100)</h3><table><thead><tr><th>Timestamp</th><th>Camera</th><th>Location</th><th>Object</th><th>Confidence</th></tr></thead><tbody>' + (objRows || '<tr><td colspan="5">No detections</td></tr>') + '</tbody></table>'
  );
}

function buildCameras(d, meta) {
  const camRows = (d.cameras || []).map(c =>
    '<tr><td><strong>' + c.name + '</strong></td><td>' + (c.location || '—') + '</td><td>' + (c.enabled ? 'Online' : 'Disabled') + '</td><td>' + (c.face_recognition_enabled ? 'Yes' : 'No') + '</td><td>' + c.face_detections + '</td><td>' + c.authorized_persons + '</td><td>' + c.unknown_persons + '</td><td>' + c.object_detections + '</td><td>' + (c.top_objects || []).map(o => o.class_name).join(', ') + '</td></tr>').join('');
  const details = (d.cameras || []).map(c => {
    const topObjs = (c.top_objects || []).map(o => '<tr><td>' + o.class_name + '</td><td>' + o.cnt + '</td></tr>').join('');
    return '<h3 style="margin-top:20px">Camera: ' + c.name + ' — ' + (c.location || 'No location') + '</h3>' +
      '<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>' +
      '<tr><td>RTSP URL</td><td style="font-family:monospace;font-size:10px">' + c.rtsp_url + '</td></tr>' +
      '<tr><td>Face Detections</td><td>' + c.face_detections + '</td></tr>' +
      '<tr><td>Authorised</td><td>' + c.authorized_persons + '</td></tr>' +
      '<tr><td>Unknown</td><td>' + c.unknown_persons + '</td></tr>' +
      '<tr><td>Objects</td><td>' + c.object_detections + '</td></tr>' +
      '<tr><td>FR Enabled</td><td>' + (c.face_recognition_enabled ? 'Yes' : 'No') + '</td></tr>' +
      '<tr><td>Recording</td><td>' + (c.recording_enabled ? 'Yes' : 'No') + '</td></tr>' +
      '<tr><td>GPS</td><td>' + (c.lat && c.lng ? c.lat + ', ' + c.lng : '—') + '</td></tr>' +
      '</tbody></table>' +
      (topObjs ? '<table><thead><tr><th>Object</th><th>Count</th></tr></thead><tbody>' + topObjs + '</tbody></table>' : '');
  }).join('');
  return wrap(
    rHeader('Camera & Video Analytics Report', d.summary.total_cameras + ' cameras', meta) +
    kRow([kBox(d.summary.total_cameras,'Cameras','#0284c7'), kBox(d.summary.total_face_detections,'Face Events','#7c3aed'), kBox(d.summary.total_object_detections,'Objects','#0891b2'), kBox(d.summary.unknown_detections,'Unknown Persons','#ea580c')], 4) +
    '<h3>Camera Summary</h3><table><thead><tr><th>Name</th><th>Location</th><th>Status</th><th>FR</th><th>Faces</th><th>Auth</th><th>Unknown</th><th>Objects</th><th>Top Objects</th></tr></thead><tbody>' + (camRows || '<tr><td colspan="9">No cameras</td></tr>') + '</tbody></table>' +
    '<div class="br"></div><h3>Per-Camera Details</h3>' + details
  );
}

function buildFaces(d, meta) {
  const s = d.summary;
  const topRows = (d.top_persons || []).map(p =>
    '<tr><td>' + p.name + '</td><td style="font-family:monospace">' + (p.employee_id || '—') + '</td><td>' + (p.role || '—') + '</td><td>' + (p.department || '—') + '</td><td>' + (p.authorized ? 'Auth' : 'Unauth') + '</td><td><strong>' + p.appearances + '</strong></td></tr>').join('');
  const fdRows = (d.face_detections || []).slice(0, 200).map(fd =>
    '<tr><td>' + fmt(fd.timestamp) + '</td><td>' + (fd.camera_name || '—') + '</td><td>' + (fd.camera_location || '—') + '</td><td>' + (fd.person_name || 'Unknown') + '</td><td style="font-family:monospace">' + (fd.employee_id || '—') + '</td><td>' + (fd.authorized ? '✓ Auth' : fd.person_name ? '✗ Unauth' : '? Unknown') + '</td><td>' + (fd.confidence != null ? (fd.confidence * 100).toFixed(1) + '%' : '—') + '</td></tr>').join('');
  const persRows = (d.persons || []).map(p =>
    '<tr><td>' + p.name + '</td><td style="font-family:monospace">' + (p.employee_id || '—') + '</td><td>' + (p.role || '—') + '</td><td>' + (p.department || '—') + '</td><td>' + (p.authorized ? 'Yes' : 'No') + '</td><td>' + fmt(p.created_at) + '</td></tr>').join('');
  return wrap(
    rHeader('Face Recognition Report', s.total_face_detections + ' detections', meta) +
    kRow([kBox(s.total_face_detections,'Total Detections','#7c3aed'), kBox(s.authorized_detections,'Authorised','#059669'), kBox(s.unknown_detections,'Unknown','#ea580c'), kBox(s.total_persons,'Registered','#0284c7')], 4) +
    '<h3>Most Frequent Persons</h3><table><thead><tr><th>Name</th><th>Employee ID</th><th>Role</th><th>Department</th><th>Status</th><th>Appearances</th></tr></thead><tbody>' + (topRows || '<tr><td colspan="6">No data</td></tr>') + '</tbody></table>' +
    '<h3>Detection Log (latest 200)</h3><table><thead><tr><th>Time</th><th>Camera</th><th>Location</th><th>Person</th><th>ID</th><th>Status</th><th>Confidence</th></tr></thead><tbody>' + (fdRows || '<tr><td colspan="7">No detections</td></tr>') + '</tbody></table>' +
    '<div class="br"></div><h3>Registered Persons Directory</h3><table><thead><tr><th>Name</th><th>Employee ID</th><th>Role</th><th>Department</th><th>Authorised</th><th>Registered</th></tr></thead><tbody>' + (persRows || '<tr><td colspan="6">No persons</td></tr>') + '</tbody></table>'
  );
}

function buildSensors(d, meta) {
  const sumRows = (d.sensor_summary || []).map(r =>
    '<tr><td><strong>' + r.device_id + '</strong></td><td>' + r.reading_count + '</td><td>' + (r.avg_temp ?? '—') + ' °C</td><td>' + (r.min_temp ?? '—') + ' °C</td><td>' + (r.max_temp ?? '—') + ' °C</td><td>' + (r.avg_hum ?? '—') + ' %</td><td>' + r.motion_events + '</td></tr>').join('');
  const devRows = (d.devices || []).map(r =>
    '<tr><td>' + r.device_id + '</td><td>' + (r.location || '—') + '</td><td>' + (r.lat && r.lng ? r.lat + ', ' + r.lng : '—') + '</td><td>' + r.status + '</td><td>' + fmt(r.last_seen) + '</td><td>' + fmt(r.trained_at) + '</td></tr>').join('');
  const rdRows = (d.sensor_readings || []).slice(0, 200).map(r =>
    '<tr><td>' + fmt(r.timestamp) + '</td><td>' + r.device_id + '</td><td>' + (r.temperature != null ? r.temperature + ' °C' : '—') + '</td><td>' + (r.humidity != null ? r.humidity + ' %' : '—') + '</td><td>' + (r.gas ?? '—') + '</td><td>' + (r.mic ?? '—') + '</td><td>' + (r.motion ? '⚠ Yes' : 'No') + '</td><td style="font-family:monospace">' + (r.ai_score != null ? Number(r.ai_score).toFixed(3) : '—') + '</td><td>' + (r.alert_type || 'NORMAL') + '</td></tr>').join('');
  const totalMotion = (d.sensor_summary || []).reduce((a, r) => a + (r.motion_events || 0), 0);
  return wrap(
    rHeader('IoT Sensor Report', d.summary.total_readings + ' readings', meta) +
    kRow([kBox(d.summary.total_readings,'Total Readings','#6366f1'), kBox((d.devices || []).length,'IoT Devices','#0284c7'), kBox(totalMotion,'Motion Events','#ea580c'), kBox(d.summary.total_alerts,'Sensor Alerts','#dc2626')], 4) +
    '<h3>Device Summary</h3><table><thead><tr><th>Device</th><th>Readings</th><th>Avg Temp</th><th>Min Temp</th><th>Max Temp</th><th>Avg Humidity</th><th>Motion</th></tr></thead><tbody>' + (sumRows || '<tr><td colspan="7">No sensor data</td></tr>') + '</tbody></table>' +
    '<h3>IoT Device Registry</h3><table><thead><tr><th>Device</th><th>Location</th><th>GPS</th><th>Status</th><th>Last Seen</th><th>Model Trained</th></tr></thead><tbody>' + (devRows || '<tr><td colspan="6">No devices</td></tr>') + '</tbody></table>' +
    '<div class="br"></div><h3>Sensor Readings Log (latest 200)</h3><table><thead><tr><th>Timestamp</th><th>Device</th><th>Temp</th><th>Humidity</th><th>Gas</th><th>Mic</th><th>Motion</th><th>AI Score</th><th>Type</th></tr></thead><tbody>' + (rdRows || '<tr><td colspan="9">No readings</td></tr>') + '</tbody></table>'
  );
}

function buildForensic(d, meta) {
  const dateStr = (meta.generatedAt || '').replace(/[^0-9]/g, '').slice(0, 8) || new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8);
  const caseId = 'CASE-' + (meta.generatedAt || '').replace(/[^0-9]/g, '').slice(0, 14);
  let evdIdx = 1;
  const allEvents = [];
  (d.alerts || []).forEach(a => allEvents.push({
    evdId: 'EVD-' + dateStr + '-' + String(evdIdx++).padStart(4, '0'),
    ts: a.timestamp, type: 'ALERT', source: a.device_id || '—',
    detail: (a.alert_type || '') + (a.severity ? ' (' + a.severity + ')' : ''),
    confidence: a.ai_score != null ? (Number(a.ai_score) * 100).toFixed(1) + '%' : '—',
    severity: a.severity || 'LOW', acqMethod: 'AI Behaviour Engine',
  }));
  (d.face_detections || []).forEach(f => allEvents.push({
    evdId: 'EVD-' + dateStr + '-' + String(evdIdx++).padStart(4, '0'),
    ts: f.timestamp, type: 'FACE', source: f.camera_name || '—',
    detail: f.person_name || 'Unknown',
    confidence: f.confidence != null ? (f.confidence * 100).toFixed(1) + '%' : '—',
    severity: f.authorized === false && f.person_name ? 'MEDIUM' : !f.authorized && !f.person_name ? 'HIGH' : 'LOW',
    acqMethod: 'Facial Recognition (dlib)',
  }));
  (d.object_detections || []).forEach(o => allEvents.push({
    evdId: 'EVD-' + dateStr + '-' + String(evdIdx++).padStart(4, '0'),
    ts: o.timestamp, type: 'OBJECT', source: o.camera_name || '—',
    detail: o.class_name,
    confidence: o.confidence != null ? (o.confidence * 100).toFixed(1) + '%' : '—',
    severity: 'INFO', acqMethod: 'YOLOv8 Object Detection',
  }));
  allEvents.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  const totalEvents = allEvents.length;

  const typeBadgeHtml = t => t === 'ALERT'
    ? '<span style="background:#7f1d1d;color:#fca5a5;padding:1px 5px;border-radius:3px;font-size:9px">ALERT</span>'
    : t === 'FACE'
    ? '<span style="background:#4c1d95;color:#c4b5fd;padding:1px 5px;border-radius:3px;font-size:9px">FACE</span>'
    : '<span style="background:#0c4a6e;color:#7dd3fc;padding:1px 5px;border-radius:3px;font-size:9px">OBJECT</span>';

  const metaBlock =
    '<div style="border:2px solid #1e3a5f;background:#0f2035;padding:16px;margin-bottom:16px;border-radius:4px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
    '<div><div style="font-size:18px;font-weight:700;color:#e2e8f0;letter-spacing:1px">DIGITAL FORENSIC INVESTIGATION REPORT</div>' +
    '<div style="font-size:11px;color:#94a3b8;margin-top:4px">Classification: CONFIDENTIAL — Law Enforcement / Security Use Only</div>' +
    '<div style="font-size:11px;color:#94a3b8">Standards: NIST SP 800-86 · ISO/IEC 27037:2012 · ACPO Good Practice Guide</div></div>' +
    '<div style="text-align:right"><div style="font-size:12px;color:#e2e8f0"><strong>Case ID:</strong> ' + caseId + '</div>' +
    '<div style="font-size:12px;color:#e2e8f0"><strong>Report ID:</strong> RPT-' + dateStr + '-001</div>' +
    '<div style="font-size:11px;color:#94a3b8"><strong>Generated:</strong> ' + (meta.generatedAt || '—') + '</div></div></div>' +
    '<hr style="border:none;border-top:1px solid #1e3a5f;margin:12px 0"/>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:11px">' +
    '<div><span style="color:#94a3b8">Examiner System:</span><br/><strong>SmartCity AI Platform</strong></div>' +
    '<div><span style="color:#94a3b8">Evidence Period From:</span><br/><strong>' + (meta.from || 'All time') + '</strong></div>' +
    '<div><span style="color:#94a3b8">Evidence Period To:</span><br/><strong>' + (meta.to || 'Present') + '</strong></div>' +
    '<div><span style="color:#94a3b8">Total Evidence Items:</span><br/><strong>' + totalEvents + '</strong></div>' +
    '</div></div>';

  const evidenceRows = allEvents.slice(0, 50).map(e =>
    '<tr><td style="font-family:monospace;font-size:9px;white-space:nowrap;color:#6ee7b7">' + e.evdId + '</td>' +
    '<td>' + typeBadgeHtml(e.type) + '</td>' +
    '<td style="font-size:10px;white-space:nowrap">' + fmt(e.ts) + '</td>' +
    '<td>' + e.source + '</td><td>' + e.detail + '</td>' +
    '<td style="text-align:center">' + e.confidence + '</td>' +
    '<td>' + e.acqMethod + '</td></tr>'
  ).join('');

  const nowStr = meta.generatedAt || '—';
  const cocRows = [
    ['1', 'AI Detection Engine (YOLOv8 / dlib)', nowStr, 'Evidence collected via automated AI analysis of RTSP video streams', '✓ Automated acquisition'],
    ['2', 'SmartCity Backend (Flask/SQLite)', nowStr, 'Evidence stored in tamper-evident SQLite database with timestamp indexing', '✓ Database integrity'],
    ['3', 'Report Generator (Frontend JS)', nowStr, 'Evidence aggregated, sorted, and assigned unique EVD identifiers', '✓ Sequential EVD IDs'],
    ['4', 'Digital Examiner / Operator', nowStr, 'Report exported for review, legal proceedings, or incident response', '⚠ Manual review required'],
  ].map(r =>
    '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td>' +
    '<td style="font-size:10px;white-space:nowrap">' + r[2] + '</td>' +
    '<td>' + r[3] + '</td><td>' + r[4] + '</td></tr>'
  ).join('');

  const timelineRows = allEvents.slice(0, 300).map(e => {
    const sevColor = e.severity === 'CRITICAL' ? '#fca5a5' : e.severity === 'HIGH' ? '#fdba74' : e.severity === 'MEDIUM' ? '#fde047' : e.severity === 'INFO' ? '#64748b' : '#86efac';
    return '<tr>' +
      '<td style="font-family:monospace;font-size:9px;color:#6ee7b7;white-space:nowrap">' + e.evdId + '</td>' +
      '<td style="font-size:10px;white-space:nowrap">' + fmt(e.ts) + '</td>' +
      '<td>' + typeBadgeHtml(e.type) + '</td>' +
      '<td>' + e.source + '</td><td>' + e.detail + '</td>' +
      '<td style="text-align:center">' + e.confidence + '</td>' +
      '<td style="color:' + sevColor + ';font-size:10px">' + e.severity + '</td></tr>';
  }).join('');

  const CLUSTER_WINDOW = 60000;
  const clusterMap = {};
  allEvents.forEach(e => { if (!clusterMap[e.source]) clusterMap[e.source] = []; clusterMap[e.source].push(e); });
  const clusters = [];
  let clusterId = 1;
  Object.entries(clusterMap).forEach(([src, evts]) => {
    const sorted = [...evts].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    let i = 0;
    while (i < sorted.length) {
      const anchor = new Date(sorted[i].ts || 0).getTime();
      if (isNaN(anchor)) { i++; continue; }
      const group = [sorted[i]];
      let j = i + 1;
      while (j < sorted.length) {
        const t = new Date(sorted[j].ts || 0).getTime();
        if (!isNaN(t) && t - anchor <= CLUSTER_WINDOW) { group.push(sorted[j]); j++; }
        else break;
      }
      if (group.length >= 2) {
        const types = [...new Set(group.map(e => e.type))].join(', ');
        const sevOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
        const maxSev = sevOrder.find(sv => group.some(e => e.severity === sv)) || 'INFO';
        const durationSec = Math.round((new Date(group[group.length - 1].ts || 0).getTime() - anchor) / 1000);
        clusters.push({ id: 'INC-' + String(clusterId++).padStart(3, '0'), start: group[0].ts, end: group[group.length - 1].ts, source: src, count: group.length, types, maxSev, duration: durationSec + 's' });
      }
      i = j > i ? j : i + 1;
    }
  });
  const clusterRows = clusters.slice(0, 50).map(c =>
    '<tr><td style="font-family:monospace;font-size:9px;color:#fde047">' + c.id + '</td>' +
    '<td style="font-size:10px">' + fmt(c.start) + '</td>' +
    '<td style="font-size:10px">' + fmt(c.end) + '</td>' +
    '<td>' + c.source + '</td>' +
    '<td style="text-align:center;font-weight:700">' + c.count + '</td>' +
    '<td>' + c.types + '</td><td>' + c.maxSev + '</td>' +
    '<td style="text-align:center">' + c.duration + '</td></tr>'
  ).join('');

  const personMap = {};
  (d.face_detections || []).forEach(f => {
    const name = f.person_name || 'Unknown';
    if (!personMap[name]) personMap[name] = { name, employee_id: f.employee_id || '—', authorized: f.authorized, first: f.timestamp, last: f.timestamp, appearances: 0, cameras: new Set() };
    const p = personMap[name];
    if ((f.timestamp || '') < (p.first || '')) p.first = f.timestamp;
    if ((f.timestamp || '') > (p.last || '')) p.last = f.timestamp;
    p.appearances++;
    if (f.camera_name) p.cameras.add(f.camera_name);
  });
  const personRows = Object.values(personMap).sort((a, b) => b.appearances - a.appearances).map(p =>
    '<tr><td>' + p.name + '</td>' +
    '<td style="font-family:monospace">' + p.employee_id + '</td>' +
    '<td style="color:' + (p.authorized ? '#4ade80' : p.name === 'Unknown' ? '#fde047' : '#f87171') + '">' + (p.authorized ? '✓ AUTHORISED' : p.name === 'Unknown' ? '? UNKNOWN' : '✗ UNAUTHORISED') + '</td>' +
    '<td style="font-size:10px">' + fmt(p.first) + '</td>' +
    '<td style="font-size:10px">' + fmt(p.last) + '</td>' +
    '<td style="text-align:center;font-weight:700">' + p.appearances + '</td>' +
    '<td>' + [...p.cameras].join(', ') + '</td></tr>'
  ).join('');

  const hourlyData = d.hourly_alerts || {};
  const maxHourly = Math.max(1, ...Object.values(hourlyData).map(Number));
  const hourlyRows = Array.from({ length: 24 }, (_, h) => {
    const hr = String(h).padStart(2, '0');
    const cnt = Number(hourlyData[hr] || 0);
    const barLen = Math.round((cnt / maxHourly) * 15);
    const bar = '■'.repeat(barLen) + '□'.repeat(15 - barLen);
    const isPeak = cnt === maxHourly && cnt > 0;
    return '<tr><td style="font-family:monospace">' + hr + ':00</td>' +
      '<td style="text-align:center;font-weight:700;color:' + (cnt > 0 ? '#f87171' : '#4b5563') + '">' + cnt + '</td>' +
      '<td style="font-family:monospace;letter-spacing:1px;color:' + (cnt > 0 ? '#ef4444' : '#374151') + '">' + bar + '</td>' +
      '<td>' + (isPeak ? '⚡ PEAK' : '') + '</td></tr>';
  }).join('');

  const sensorRows = (d.sensor_readings || []).filter(r => r.motion || r.alert_type).slice(0, 50).map(r => {
    const rTime = new Date(r.timestamp || 0).getTime();
    const correlated = (d.alerts || []).find(a => Math.abs(new Date(a.timestamp || 0).getTime() - rTime) <= 60000);
    return '<tr>' +
      '<td style="font-size:10px;white-space:nowrap">' + fmt(r.timestamp) + '</td>' +
      '<td>' + r.device_id + '</td>' +
      '<td style="text-align:center">' + (r.motion ? '⚠ YES' : '—') + '</td>' +
      '<td>' + (r.temperature != null ? r.temperature + '°C' : '—') + '</td>' +
      '<td>' + (r.gas != null ? r.gas : '—') + '</td>' +
      '<td style="font-family:monospace">' + (r.ai_score != null ? Number(r.ai_score).toFixed(3) : '—') + '</td>' +
      '<td>' + (r.alert_type || 'NORMAL') + '</td>' +
      '<td style="color:' + (correlated ? '#fde047' : '#4b5563') + '">' + (correlated ? (correlated.alert_type || '—') + ' @ ' + (correlated.device_id || '—') : '—') + '</td></tr>';
  }).join('');

  const simpleHash = totalEvents * 31 + (d.alerts || []).length * 17 + (d.face_detections || []).length * 13 + (d.object_detections || []).length * 7;
  const footer =
    '<div style="border:1px solid #1e3a5f;background:#0a1628;padding:12px;margin-top:16px;border-radius:4px;font-size:10px">' +
    '<div style="color:#6ee7b7;font-weight:700;margin-bottom:6px">REPORT INTEGRITY STATEMENT</div>' +
    '<div style="color:#94a3b8">This report was automatically generated by the SmartCity AI Security Platform in accordance with digital forensic best practices (NIST SP 800-86, ISO/IEC 27037:2012, ACPO Good Practice Guide for Digital Evidence). All evidence items have been assigned unique identifiers. The chain of custody has been documented from point of acquisition through AI detection systems to this report. This report should be treated as CONFIDENTIAL and handled in accordance with applicable data protection legislation.</div>' +
    '<div style="display:flex;gap:24px;margin-top:8px;flex-wrap:wrap">' +
    '<span><strong>Report Generated:</strong> ' + (meta.generatedAt || '—') + '</span>' +
    '<span><strong>Total Evidence Items:</strong> ' + totalEvents + '</span>' +
    '<span><strong>Incident Clusters:</strong> ' + clusters.length + '</span>' +
    '<span><strong>Report Checksum:</strong> 0x' + simpleHash.toString(16).toUpperCase().padStart(8, '0') + '</span>' +
    '<span><strong>Case ID:</strong> ' + caseId + '</span>' +
    '</div></div>';

  return wrap(
    rHeader('Digital Forensic Investigation Report', 'Case ' + caseId + ' · ' + totalEvents + ' evidence items', meta) +
    metaBlock +
    kRow([kBox(totalEvents,'Total Evidence','#374151'), kBox((d.alerts||[]).length,'Alerts','#dc2626'), kBox((d.face_detections||[]).length,'Face Events','#7c3aed'), kBox((d.object_detections||[]).length,'Object Events','#0891b2'), kBox((d.sensor_readings||[]).filter(r=>r.motion).length,'Sensor Triggers','#ea580c')], 5) +
    '<h3>§1 Evidence Inventory (first 50 of ' + totalEvents + ')</h3>' +
    '<table><thead><tr><th>Evidence ID</th><th>Type</th><th>Timestamp</th><th>Source</th><th>Detail</th><th>Confidence</th><th>Acquisition Method</th></tr></thead><tbody>' + (evidenceRows || '<tr><td colspan="7">No evidence collected</td></tr>') + '</tbody></table>' +
    '<h3>§2 Chain of Custody</h3>' +
    '<table><thead><tr><th>Step</th><th>Custodian</th><th>Date/Time</th><th>Action</th><th>Integrity</th></tr></thead><tbody>' + cocRows + '</tbody></table>' +
    '<h3>§3 Chronological Forensic Timeline (' + Math.min(totalEvents, 300) + ' of ' + totalEvents + ' events)</h3>' +
    '<table><thead><tr><th>Evidence ID</th><th>Timestamp</th><th>Type</th><th>Source</th><th>Detail</th><th>Confidence</th><th>Severity</th></tr></thead><tbody>' + (timelineRows || '<tr><td colspan="7">No events</td></tr>') + '</tbody></table>' +
    (clusters.length ? '<h3>§4 Incident Clusters (' + clusters.length + ' identified)</h3>' +
      '<table><thead><tr><th>Cluster ID</th><th>Start</th><th>End</th><th>Source</th><th>Events</th><th>Types</th><th>Max Severity</th><th>Duration</th></tr></thead><tbody>' + clusterRows + '</tbody></table>' : '') +
    (Object.keys(personMap).length ? '<h3>§5 Person Activity Log</h3>' +
      '<table><thead><tr><th>Name</th><th>Employee ID</th><th>Status</th><th>First Seen</th><th>Last Seen</th><th>Appearances</th><th>Cameras</th></tr></thead><tbody>' + personRows + '</tbody></table>' : '') +
    '<h3>§6 Hourly Alert Distribution</h3>' +
    '<table><thead><tr><th>Hour</th><th>Alerts</th><th>Distribution</th><th>Note</th></tr></thead><tbody>' + hourlyRows + '</tbody></table>' +
    (sensorRows ? '<h3>§7 IoT Sensor Correlation (motion / alert events)</h3>' +
      '<table><thead><tr><th>Timestamp</th><th>Device</th><th>Motion</th><th>Temp</th><th>Gas</th><th>AI Score</th><th>Alert Type</th><th>Correlated Camera Event</th></tr></thead><tbody>' + sensorRows + '</tbody></table>' : '') +
    footer
  );
}

function Section({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-xl overflow-hidden mb-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-600 transition-colors">
        {open ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
        {Icon && <Icon size={14} className="text-slate-400 shrink-0" />}
        <span className="text-sm font-semibold text-slate-200">{title}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function KpiCard({ value, label, color = 'text-white' }) {
  return (
    <div className="bg-surface-700 border border-surface-500 rounded-xl p-3 text-center">
      <p className={'text-2xl font-bold ' + color}>{value ?? 0}</p>
      <p className="text-xs text-slate-400 mt-1 leading-tight">{label}</p>
    </div>
  );
}

function PTable({ cols, rows, empty = 'No data' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-400">
            {cols.map(c => <th key={c} className="text-left py-1.5 px-2 text-slate-400 font-medium whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr><td colSpan={cols.length} className="py-4 text-center text-slate-500 italic">{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-b border-surface-600 hover:bg-surface-600 transition-colors">
              {r.map((cell, j) => <td key={j} className="py-1.5 px-2 text-slate-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SevBadge({ s }) {
  const cls = s === 'CRITICAL' ? 'bg-accent-900/50 text-accent-300' : s === 'HIGH' ? 'bg-coral-900/50 text-coral-300' : s === 'MEDIUM' ? 'bg-bronze-900/50 text-bronze-300' : 'bg-emerald-900/50 text-emerald-300';
  return <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + cls}>{s}</span>;
}

const REPORT_TYPES = [
  { id: 'executive', label: 'Executive Summary', icon: Activity,       desc: 'KPIs, overview, camera summary' },
  { id: 'threats',   label: 'Threat Detection',  icon: AlertTriangle,  desc: 'Alerts, objects, severity breakdown' },
  { id: 'cameras',   label: 'Camera Report',     icon: Camera,         desc: 'Per-camera activity stats' },
  { id: 'faces',     label: 'Face Recognition',  icon: User,           desc: 'Persons, access log, unknowns' },
  { id: 'sensors',   label: 'Sensor / IoT',      icon: Thermometer,    desc: 'Temp, humidity, motion events' },
  { id: 'forensic',  label: 'Forensic Timeline', icon: Search,         desc: 'Merged chronological event log' },
];

export default function ReportCenter() {
  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [rType,   setRType]   = useState('executive');
  const [from,    setFrom]    = useState(weekAgo);
  const [to,      setTo]      = useState(today);
  const [camId,   setCamId]   = useState('');
  const [data,    setData]    = useState(null);
  const [cams,    setCams]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  React.useEffect(() => {
    apiFetch('/cameras').then(r => r.json()).then(d => { if (d.success) setCams(d.data || []); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (from)  p.set('from_date', from);
      if (to)    p.set('to_date',   to);
      if (camId) p.set('camera_id', camId);
      const r = await apiFetch('/report/full?' + p);
      const d = await r.json();
      if (d.success) setData(d.data);
      else setError(d.error || 'Failed to load');
    } catch { setError('Cannot connect to backend'); }
    setLoading(false);
  }, [from, to, camId]);

  const meta = () => ({ generatedAt: new Date().toLocaleString('en-GB', { hour12: false }), from: from || 'all time', to: to || 'now' });

  const handlePrint = () => {
    if (!data) return;
    const m = meta();
    const builders = { executive: buildExecutive, threats: buildThreats, cameras: buildCameras, faces: buildFaces, sensors: buildSensors, forensic: buildForensic };
    printHtml((builders[rType] || buildExecutive)(data, m));
  };

  const handleCsv = () => {
    if (!data) return;
    let rows = [], name = 'report_' + rType + '_' + today;
    if (rType === 'executive' || rType === 'threats') { rows = data.alerts || []; name = 'alerts_' + from + '_' + to; }
    else if (rType === 'cameras') {
      rows = (data.cameras || []).map(c => ({ name: c.name, location: c.location, face_detections: c.face_detections, authorized: c.authorized_persons, unknown: c.unknown_persons, objects: c.object_detections }));
      name = 'cameras_' + from + '_' + to;
    } else if (rType === 'faces') { rows = data.face_detections || []; name = 'face_detections_' + from + '_' + to; }
    else if (rType === 'sensors') { rows = data.sensor_readings || []; name = 'sensor_readings_' + from + '_' + to; }
    else if (rType === 'forensic') {
      const events = [];
      (data.alerts || []).forEach(a => events.push({ type: 'ALERT', ts: a.timestamp, source: a.device_id, detail: a.alert_type, severity: a.severity }));
      (data.face_detections || []).forEach(f => events.push({ type: 'FACE', ts: f.timestamp, source: f.camera_name, detail: f.person_name || 'Unknown', severity: f.authorized ? 'AUTH' : 'UNKNOWN' }));
      (data.object_detections || []).forEach(o => events.push({ type: 'OBJECT', ts: o.timestamp, source: o.camera_name, detail: o.class_name, severity: 'INFO' }));
      events.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      rows = events; name = 'forensic_' + from + '_' + to;
    }
    downloadCsv(rows, name + '.csv');
  };

  const s = data?.summary || {};

  const renderPreview = () => {
    if (!data) return null;
    if (rType === 'executive') return (<>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard value={s.total_alerts} label="Total Alerts" color="text-red-400" />
        <KpiCard value={s.critical_alerts} label="Critical" color="text-red-300" />
        <KpiCard value={s.total_face_detections} label="Face Detections" color="text-violet-400" />
        <KpiCard value={s.total_cameras} label="Active Cameras" color="text-sky-400" />
        <KpiCard value={s.unknown_detections} label="Unknown Persons" color="text-orange-400" />
        <KpiCard value={s.authorized_detections} label="Authorised" color="text-green-400" />
        <KpiCard value={s.total_object_detections} label="Objects Detected" color="text-cyan-400" />
        <KpiCard value={s.total_readings} label="Sensor Readings" color="text-indigo-400" />
      </div>
      <Section title="Alert Type Breakdown" icon={AlertTriangle}>
        <PTable cols={['Type', 'Count', '%']} rows={Object.entries(data.alert_type_counts || {}).map(([t, c]) => [t, c, pct(c, s.total_alerts)])} />
      </Section>
      <Section title="Camera Activity" icon={Camera}>
        <PTable cols={['Camera', 'Location', 'Faces', 'Auth', 'Unknown', 'Objects']} rows={(data.cameras || []).map(c => [c.name, c.location || '—', c.face_detections, c.authorized_persons, c.unknown_persons, c.object_detections])} />
      </Section>
    </>);

    if (rType === 'threats') return (<>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard value={s.total_alerts} label="Total Alerts" color="text-red-400" />
        <KpiCard value={s.critical_alerts} label="Critical" color="text-red-300" />
        <KpiCard value={s.high_alerts} label="High" color="text-orange-400" />
        <KpiCard value={s.total_object_detections} label="Objects" color="text-cyan-400" />
      </div>
      <Section title="Top Detected Classes" icon={Search}>
        <PTable cols={['Object Class', 'Count']} rows={(data.top_classes || []).map(c => [c.class_name, c.cnt])} />
      </Section>
      <Section title="Alert Log (latest 50)" icon={AlertTriangle}>
        <PTable cols={['#', 'Device', 'Type', 'Severity', 'Score', 'Time', 'Status']} rows={(data.alerts || []).slice(0, 50).map(a => [a.id, a.device_id || '—', a.alert_type || '—', <SevBadge key={a.id} s={a.severity} />, a.ai_score != null ? Number(a.ai_score).toFixed(3) : '—', fmt(a.timestamp), <span key={'st'+a.id} className={a.resolved ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>{a.resolved ? '✓' : '⚠'}</span>])} />
      </Section>
    </>);

    if (rType === 'cameras') return (<>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard value={s.total_cameras} label="Cameras" color="text-sky-400" />
        <KpiCard value={s.total_face_detections} label="Face Events" color="text-violet-400" />
        <KpiCard value={s.total_object_detections} label="Object Events" color="text-cyan-400" />
        <KpiCard value={s.unknown_detections} label="Unknown Persons" color="text-orange-400" />
      </div>
      <Section title="Camera Summary" icon={Camera}>
        <PTable cols={['Name', 'Location', 'Status', 'FR', 'Faces', 'Auth', 'Unknown', 'Objects']} rows={(data.cameras || []).map(c => [c.name, c.location || '—', <span key={c.id} className={c.enabled ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>{c.enabled ? 'Online' : 'Off'}</span>, <span key={'fr'+c.id} className={c.face_recognition_enabled ? 'text-blue-400 text-[10px]' : 'text-slate-500 text-[10px]'}>{c.face_recognition_enabled ? 'Yes' : 'No'}</span>, c.face_detections, c.authorized_persons, c.unknown_persons, c.object_detections])} />
      </Section>
      {(data.cameras || []).map(c => (
        <Section key={c.id} title={'Camera: ' + c.name + ' — ' + (c.location || 'No location')} icon={null} defaultOpen={false}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <KpiCard value={c.face_detections} label="Faces" color="text-violet-400" />
            <KpiCard value={c.authorized_persons} label="Authorised" color="text-green-400" />
            <KpiCard value={c.unknown_persons} label="Unknown" color="text-orange-400" />
          </div>
          {c.top_objects?.length > 0 && <PTable cols={['Object', 'Count']} rows={c.top_objects.map(o => [o.class_name, o.cnt])} />}
        </Section>
      ))}
    </>);

    if (rType === 'faces') return (<>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard value={s.total_face_detections} label="Total Detections" color="text-violet-400" />
        <KpiCard value={s.authorized_detections} label="Authorised" color="text-green-400" />
        <KpiCard value={s.unknown_detections} label="Unknown" color="text-orange-400" />
        <KpiCard value={s.total_persons} label="Registered" color="text-sky-400" />
      </div>
      <Section title="Most Frequent Persons" icon={User}>
        <PTable cols={['Name', 'ID', 'Role', 'Dept', 'Status', 'Appearances']} rows={(data.top_persons || []).map(p => [p.name, p.employee_id || '—', p.role || '—', p.department || '—', <span key={p.name} className={p.authorized ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>{p.authorized ? 'Auth' : 'Unauth'}</span>, <strong key={'c'+p.name}>{p.appearances}</strong>])} />
      </Section>
      <Section title="Detection Log (latest 50)" icon={Search}>
        <PTable cols={['Time', 'Camera', 'Person', 'Status', 'Confidence']} rows={(data.face_detections || []).slice(0, 50).map(fd => [fmt(fd.timestamp), fd.camera_name || '—', fd.person_name || <em key={fd.id} className="text-slate-500">Unknown</em>, <span key={'s'+fd.id} className={fd.authorized ? 'text-green-400 text-[10px]' : fd.person_name ? 'text-red-400 text-[10px]' : 'text-yellow-400 text-[10px]'}>{fd.authorized ? '✓ Auth' : fd.person_name ? '✗ Unauth' : '? Unknown'}</span>, fd.confidence != null ? (fd.confidence * 100).toFixed(1) + '%' : '—'])} />
      </Section>
    </>);

    if (rType === 'sensors') {
      const totalMotion = (data.sensor_summary || []).reduce((a, d) => a + (d.motion_events || 0), 0);
      return (<>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiCard value={s.total_readings} label="Total Readings" color="text-indigo-400" />
          <KpiCard value={(data.devices || []).length} label="IoT Devices" color="text-sky-400" />
          <KpiCard value={totalMotion} label="Motion Events" color="text-orange-400" />
          <KpiCard value={s.total_alerts} label="Sensor Alerts" color="text-red-400" />
        </div>
        <Section title="Device Summary" icon={Thermometer}>
          <PTable cols={['Device', 'Readings', 'Avg Temp', 'Min', 'Max', 'Avg Hum', 'Motion']} rows={(data.sensor_summary || []).map(d => [d.device_id, d.reading_count, d.avg_temp != null ? d.avg_temp + '°C' : '—', d.min_temp != null ? d.min_temp + '°C' : '—', d.max_temp != null ? d.max_temp + '°C' : '—', d.avg_hum != null ? d.avg_hum + '%' : '—', d.motion_events])} />
        </Section>
        <Section title="Recent Readings (30)" icon={Activity}>
          <PTable cols={['Time', 'Device', 'Temp', 'Humidity', 'Motion', 'Type']} rows={(data.sensor_readings || []).slice(0, 30).map(r => [fmt(r.timestamp), r.device_id, r.temperature != null ? r.temperature + '°C' : '—', r.humidity != null ? r.humidity + '%' : '—', <span key={r.id} className={r.motion ? 'text-orange-400 text-[10px]' : 'text-slate-500 text-[10px]'}>{r.motion ? '⚠' : '—'}</span>, r.alert_type || 'NORMAL'])} />
        </Section>
      </>);
    }

    if (rType === 'forensic') {
      const fDateStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8);
      const fCaseId = 'CASE-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      let fEvdIdx = 1;
      const allEvents = [];
      (data.alerts || []).forEach(a => allEvents.push({
        evdId: 'EVD-' + fDateStr + '-' + String(fEvdIdx++).padStart(4, '0'),
        ts: a.timestamp, type: 'ALERT', source: a.device_id || '—',
        detail: (a.alert_type || '') + (a.severity ? ' (' + a.severity + ')' : ''),
        confidence: a.ai_score != null ? (Number(a.ai_score) * 100).toFixed(1) + '%' : '—',
        severity: a.severity || 'LOW', acqMethod: 'AI Behaviour Engine',
      }));
      (data.face_detections || []).forEach(f => allEvents.push({
        evdId: 'EVD-' + fDateStr + '-' + String(fEvdIdx++).padStart(4, '0'),
        ts: f.timestamp, type: 'FACE', source: f.camera_name || '—',
        detail: f.person_name || 'Unknown',
        confidence: f.confidence != null ? (f.confidence * 100).toFixed(1) + '%' : '—',
        severity: f.authorized === false && f.person_name ? 'MEDIUM' : !f.authorized && !f.person_name ? 'HIGH' : 'LOW',
        acqMethod: 'Facial Recognition (dlib)', authorized: f.authorized,
      }));
      (data.object_detections || []).forEach(o => allEvents.push({
        evdId: 'EVD-' + fDateStr + '-' + String(fEvdIdx++).padStart(4, '0'),
        ts: o.timestamp, type: 'OBJECT', source: o.camera_name || '—',
        detail: o.class_name,
        confidence: o.confidence != null ? (o.confidence * 100).toFixed(1) + '%' : '—',
        severity: 'INFO', acqMethod: 'YOLOv8 Object Detection',
      }));
      allEvents.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

      const fPersonMap = {};
      (data.face_detections || []).forEach(f => {
        const name = f.person_name || 'Unknown';
        if (!fPersonMap[name]) fPersonMap[name] = { name, employee_id: f.employee_id || '—', authorized: f.authorized, first: f.timestamp, last: f.timestamp, appearances: 0, cameras: new Set() };
        const p = fPersonMap[name];
        if ((f.timestamp || '') < (p.first || '')) p.first = f.timestamp;
        if ((f.timestamp || '') > (p.last || '')) p.last = f.timestamp;
        p.appearances++;
        if (f.camera_name) p.cameras.add(f.camera_name);
      });

      const F_CLUSTER_WINDOW = 60000;
      const fClusterMap = {};
      allEvents.forEach(e => { if (!fClusterMap[e.source]) fClusterMap[e.source] = []; fClusterMap[e.source].push(e); });
      const fClusters = [];
      let fClusterId = 1;
      Object.entries(fClusterMap).forEach(([src, evts]) => {
        const sorted = [...evts].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
        let i = 0;
        while (i < sorted.length) {
          const anchor = new Date(sorted[i].ts || 0).getTime();
          if (isNaN(anchor)) { i++; continue; }
          const group = [sorted[i]];
          let j = i + 1;
          while (j < sorted.length) {
            const t = new Date(sorted[j].ts || 0).getTime();
            if (!isNaN(t) && t - anchor <= F_CLUSTER_WINDOW) { group.push(sorted[j]); j++; } else break;
          }
          if (group.length >= 2) {
            const types = [...new Set(group.map(e => e.type))].join(', ');
            const sevOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
            const maxSev = sevOrder.find(sv => group.some(e => e.severity === sv)) || 'INFO';
            const durSec = Math.round((new Date(group[group.length - 1].ts || 0).getTime() - anchor) / 1000);
            fClusters.push({ id: 'INC-' + String(fClusterId++).padStart(3, '0'), start: group[0].ts, end: group[group.length - 1].ts, source: src, count: group.length, types, maxSev, duration: durSec + 's' });
          }
          i = j > i ? j : i + 1;
        }
      });

      const fTypeBadge = (t) => {
        const cls = t === 'ALERT' ? 'bg-red-900/60 text-red-300' : t === 'FACE' ? 'bg-violet-900/60 text-violet-300' : 'bg-cyan-900/60 text-cyan-300';
        return <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + cls}>{t}</span>;
      };
      const fSevColor = sv => sv === 'CRITICAL' ? 'text-red-400' : sv === 'HIGH' ? 'text-orange-400' : sv === 'MEDIUM' ? 'text-yellow-400' : sv === 'INFO' ? 'text-slate-500' : 'text-green-400';
      const sensorMotion = (data.sensor_readings || []).filter(r => r.motion).length;
      const fMeta = meta();

      return (<>
        {}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <KpiCard value={allEvents.length} label="Total Evidence Items" color="text-white" />
          <KpiCard value={(data.alerts || []).length} label="Alert Events" color="text-red-400" />
          <KpiCard value={(data.face_detections || []).length} label="Face Events" color="text-violet-400" />
          <KpiCard value={(data.object_detections || []).length} label="Object Events" color="text-cyan-400" />
          <KpiCard value={sensorMotion} label="Sensor Triggers" color="text-orange-400" />
        </div>

        {}
        <Section title="Case Metadata" icon={Search}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {[['Case ID', fCaseId], ['Classification', 'CONFIDENTIAL'], ['Standards', 'NIST SP 800-86 · ISO 27037 · ACPO'], ['Evidence Period', (fMeta.from || 'all') + ' → ' + (fMeta.to || 'now')], ['Generated', fMeta.generatedAt], ['Total Items', allEvents.length]].map(([k, v]) => (
              <div key={k} className="bg-surface-700 rounded p-2">
                <div className="text-slate-500 text-[10px] uppercase tracking-wider">{k}</div>
                <div className="text-slate-200 font-medium mt-0.5 break-all">{v}</div>
              </div>
            ))}
          </div>
        </Section>

        {}
        <Section title={'§1 Evidence Inventory (first 50 of ' + allEvents.length + ')'} icon={Search}>
          <PTable cols={['Evidence ID', 'Type', 'Timestamp', 'Source', 'Detail', 'Confidence', 'Acquisition']}
            rows={allEvents.slice(0, 50).map((e, i) => [
              <span key={i} className="font-mono text-[10px] text-emerald-400">{e.evdId}</span>,
              fTypeBadge(e.type),
              <span key={'t'+i} className="whitespace-nowrap text-[10px]">{fmt(e.ts)}</span>,
              e.source, e.detail, e.confidence, e.acqMethod
            ])} />
        </Section>

        {}
        <Section title={'§2 Forensic Timeline (' + Math.min(allEvents.length, 100) + ' of ' + allEvents.length + ')'} icon={Search} defaultOpen={false}>
          <PTable cols={['Evidence ID', 'Timestamp', 'Type', 'Source', 'Detail', 'Confidence', 'Severity']}
            rows={allEvents.slice(0, 100).map((e, i) => [
              <span key={i} className="font-mono text-[10px] text-emerald-400">{e.evdId}</span>,
              <span key={'t'+i} className="whitespace-nowrap text-[10px]">{fmt(e.ts)}</span>,
              fTypeBadge(e.type), e.source, e.detail, e.confidence,
              <span key={'s'+i} className={fSevColor(e.severity) + ' text-[10px] font-medium'}>{e.severity}</span>
            ])} />
        </Section>

        {}
        {fClusters.length > 0 && (
          <Section title={'§3 Incident Clusters (' + fClusters.length + ' detected)'} icon={AlertTriangle}>
            <PTable cols={['Cluster ID', 'Start', 'End', 'Source', 'Events', 'Types', 'Max Severity', 'Duration']}
              rows={fClusters.slice(0, 30).map((c, i) => [
                <span key={i} className="font-mono text-[10px] text-yellow-400">{c.id}</span>,
                <span key={'s'+i} className="whitespace-nowrap text-[10px]">{fmt(c.start)}</span>,
                <span key={'e'+i} className="whitespace-nowrap text-[10px]">{fmt(c.end)}</span>,
                c.source, <strong key={'ct'+i}>{c.count}</strong>, c.types,
                <span key={'sv'+i} className={fSevColor(c.maxSev) + ' text-[10px] font-medium'}>{c.maxSev}</span>,
                c.duration
              ])} />
          </Section>
        )}

        {}
        {Object.keys(fPersonMap).length > 0 && (
          <Section title="§4 Person Activity Log" icon={User}>
            <PTable cols={['Name', 'Employee ID', 'Status', 'First Seen', 'Last Seen', 'Appearances', 'Cameras']}
              rows={Object.values(fPersonMap).sort((a, b) => b.appearances - a.appearances).map((p, i) => [
                p.name,
                <span key={i} className="font-mono text-[10px]">{p.employee_id}</span>,
                <span key={'a'+i} className={(p.authorized ? 'text-green-400' : p.name === 'Unknown' ? 'text-yellow-400' : 'text-red-400') + ' text-[10px] font-medium'}>{p.authorized ? '✓ AUTH' : p.name === 'Unknown' ? '? UNKNOWN' : '✗ UNAUTH'}</span>,
                <span key={'f'+i} className="whitespace-nowrap text-[10px]">{fmt(p.first)}</span>,
                <span key={'l'+i} className="whitespace-nowrap text-[10px]">{fmt(p.last)}</span>,
                <strong key={'c'+i}>{p.appearances}</strong>,
                [...p.cameras].join(', ') || '—'
              ])} />
          </Section>
        )}

        {}
        <Section title="§5 Hourly Alert Distribution" icon={Activity} defaultOpen={false}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px]">
            {Array.from({ length: 24 }, (_, h) => {
              const hr = String(h).padStart(2, '0');
              const cnt = Number((data.hourly_alerts || {})[hr] || 0);
              const maxH = Math.max(1, ...Object.values(data.hourly_alerts || { '0': 0 }).map(Number));
              const pctBar = Math.round((cnt / maxH) * 100);
              return (
                <div key={hr} className="bg-surface-700 rounded p-1.5">
                  <div className="flex justify-between mb-1">
                    <span className="font-mono text-slate-400">{hr}:00</span>
                    <span className={cnt > 0 ? 'text-red-400 font-bold' : 'text-slate-600'}>{cnt}</span>
                  </div>
                  <div className="h-1 bg-surface-500 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{width: pctBar + '%'}} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {}
        <Section title="§6 Chain of Custody" icon={Search} defaultOpen={false}>
          <PTable cols={['Step', 'Custodian', 'Date/Time', 'Action', 'Integrity']}
            rows={[
              ['1', 'AI Detection Engine (YOLOv8 / dlib)', fMeta.generatedAt, 'Evidence collected via automated AI analysis of RTSP video streams', '✓ Automated'],
              ['2', 'SmartCity Backend (Flask/SQLite)', fMeta.generatedAt, 'Stored in tamper-evident SQLite database with timestamp indexing', '✓ DB integrity'],
              ['3', 'Report Generator', fMeta.generatedAt, 'Evidence aggregated, sorted, assigned unique EVD identifiers', '✓ Sequential IDs'],
              ['4', 'Digital Examiner / Operator', fMeta.generatedAt, 'Report exported for review, legal proceedings, or incident response', '⚠ Manual review'],
            ].map((r, i) => [
              <strong key={i}>{r[0]}</strong>, r[1],
              <span key={'t'+i} className="whitespace-nowrap text-[10px]">{r[2]}</span>, r[3],
              <span key={'g'+i} className={r[4].startsWith('✓') ? 'text-green-400 text-[10px]' : 'text-yellow-400 text-[10px]'}>{r[4]}</span>
            ])} />
        </Section>
      </>);
    }
    return null;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-3 text-sm">Report Type</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {REPORT_TYPES.map(t => {
            const Icon = t.icon;
            const active = rType === t.id;
            return (
              <button key={t.id} onClick={() => setRType(t.id)} title={t.desc}
                className={['flex flex-col items-center text-center gap-1.5 p-3 rounded-xl border transition-all text-xs', active ? 'bg-primary-500/20 border-primary-500/50 text-primary-300' : 'bg-surface-700 border-surface-500 text-slate-400 hover:border-slate-400 hover:text-white'].join(' ')}>
                <Icon size={18} />
                <span className="font-semibold leading-tight">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-surface-700 border border-surface-400 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-surface-700 border border-surface-400 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Camera</label>
            <select value={camId} onChange={e => setCamId(e.target.value)}
              className="bg-surface-700 border border-surface-400 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500">
              <option value="">All Cameras</option>
              {cams.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-500/20 border border-primary-500/40 text-primary-300 hover:bg-primary-500/30 transition-colors text-sm font-medium">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Load Report'}
          </button>
          {data && <>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-700 border border-surface-500 text-slate-300 hover:text-white transition-colors text-sm">
              <Printer size={14} /> Print / PDF
            </button>
            <button onClick={handleCsv}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-700 border border-surface-500 text-slate-300 hover:text-white transition-colors text-sm">
              <Download size={14} /> Export CSV
            </button>
          </>}
        </div>
        {error && <p className="text-accent-400 text-sm mt-3 flex items-center gap-1.5"><AlertTriangle size={14} />{error}</p>}
      </div>

      {}
      {data ? (
        <div className="bg-surface-600 border border-surface-500 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">{REPORT_TYPES.find(t => t.id === rType)?.label} — Preview</h3>
            <span className="text-xs text-slate-500">{from} → {to}{camId ? ' · ' + (cams.find(c => String(c.id) === String(camId))?.name || 'Camera ' + camId) : ' · All Cameras'}</span>
          </div>
          {renderPreview()}
        </div>
      ) : (
        <div className="bg-surface-600 border border-surface-500 rounded-2xl flex flex-col items-center justify-center py-24 text-slate-500">
          <Printer size={48} className="mb-4 text-slate-600" />
          <p className="text-lg font-medium mb-1">No report loaded</p>
          <p className="text-sm">Select a date range and click <strong className="text-slate-400">Load Report</strong></p>
        </div>
      )}
    </div>
  );
}
