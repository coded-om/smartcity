import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Collapse from '@mui/material/Collapse';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import {
  Printer, Download, RefreshCw,
  AlertTriangle, Activity, Camera, User,
  Thermometer, Search, ChevronDown, ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../apiBase';

/* ── helpers ── */
function fmt(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('en-GB', { hour12: false }); }
  catch { return ts; }
}
function pct(num, total) { return !total ? '0%' : ((num / total) * 100).toFixed(1) + '%'; }
function toCsv(rows) {
  if (!rows?.length) return '';
  const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map(r => keys.map(k => { const v = r[k] == null ? '' : String(r[k]); return v.includes(',') || v.includes('"') ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','))].join('\n');
}
function downloadCsv(rows, filename) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function printHtml(html) {
  const win = window.open('', '_blank', 'width=1000,height=750');
  win.document.write(html); win.document.close(); win.onload = () => win.print();
}

/* ── print builders (unchanged logic) ── */
const BASE_STYLE = `body{font-family:'Segoe UI',Arial,sans-serif;color:#111;background:#fff;margin:0;padding:20px}h1{font-size:22px;margin:0;color:#1e293b}h2{font-size:15px;color:#475569;margin:4px 0 0}h3{font-size:13px;font-weight:600;color:#1e293b;margin:18px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin-bottom:16px;font-size:11px}th{background:#f1f5f9;color:#374151;font-weight:600;padding:7px 10px;border:1px solid #e2e8f0;text-align:left}td{padding:6px 10px;border:1px solid #e2e8f0;color:#374151}tr:nth-child(even) td{background:#f8fafc}.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1d4ed8;padding-bottom:14px;margin-bottom:22px}.header-meta{text-align:right;font-size:11px;color:#94a3b8;line-height:1.6}.kpi-row{display:grid;gap:12px;margin-bottom:22px}.kpi{border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;background:#f8fafc}.kpi-num{font-size:26px;font-weight:700;line-height:1}.kpi-lbl{font-size:10px;color:#64748b;margin-top:4px}.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}@media print{@page{margin:14mm}body{padding:0}}`;
const wrap = html => `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE_STYLE}</style></head><body>${html}</body></html>`;
const rHeader = (title, sub, meta) =>
  `<div class="header"><div><h1>SmartCity Security System</h1><h2>${title}</h2>${sub ? `<p style="font-size:11px;color:#94a3b8;margin:4px 0 0">${sub}</p>` : ''}</div><div class="header-meta"><div>Generated: ${meta.generatedAt}</div><div>Period: ${meta.from} → ${meta.to}</div><div style="margin-top:4px;font-size:10px;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;display:inline-block">CONFIDENTIAL</div></div></div>`;
const kBox  = (n, l, c) => `<div class="kpi"><div class="kpi-num" style="color:${c}">${n ?? 0}</div><div class="kpi-lbl">${l}</div></div>`;
const kRow  = (boxes, cols) => `<div class="kpi-row" style="grid-template-columns:repeat(${cols},1fr)">${boxes.join('')}</div>`;

function buildExecutive(d, meta) {
  const s = d.summary;
  const atRows  = Object.entries(d.alert_type_counts || {}).map(([t,c]) => `<tr><td>${t}</td><td>${c}</td><td>${pct(c, s.total_alerts)}</td></tr>`).join('');
  const svRows  = Object.entries(d.severity_counts  || {}).map(([sv,c]) => `<tr><td>${sv}</td><td>${c}</td><td>${pct(c, s.total_alerts)}</td></tr>`).join('');
  const camRows = (d.cameras || []).map(c => `<tr><td>${c.name}</td><td>${c.location||'—'}</td><td>${c.face_detections}</td><td>${c.authorized_persons}</td><td>${c.unknown_persons}</td><td>${c.object_detections}</td></tr>`).join('');
  return wrap(rHeader('Executive Summary Report', null, meta) +
    kRow([kBox(s.total_alerts,'Total Alerts','#dc2626'), kBox(s.critical_alerts,'Critical','#b91c1c'), kBox(s.total_face_detections,'Face Detections','#7c3aed'), kBox(s.total_cameras,'Active Cameras','#0284c7')], 4) +
    kRow([kBox(s.unknown_detections,'Unknown Persons','#ea580c'), kBox(s.authorized_detections,'Authorised','#059669'), kBox(s.total_object_detections,'Objects','#0891b2'), kBox(s.total_readings,'Sensor Readings','#6366f1')], 4) +
    `<h3>Alert Type Breakdown</h3><table><thead><tr><th>Type</th><th>Count</th><th>%</th></tr></thead><tbody>${atRows||'<tr><td colspan="3">No data</td></tr>'}</tbody></table>` +
    `<h3>Severity Distribution</h3><table><thead><tr><th>Severity</th><th>Count</th><th>%</th></tr></thead><tbody>${svRows||'<tr><td colspan="3">No data</td></tr>'}</tbody></table>` +
    `<h3>Camera Activity</h3><table><thead><tr><th>Camera</th><th>Location</th><th>Faces</th><th>Auth</th><th>Unknown</th><th>Objects</th></tr></thead><tbody>${camRows||'<tr><td colspan="6">No cameras</td></tr>'}</tbody></table>`
  );
}
function buildThreats(d, meta) {
  const s = d.summary;
  const alertRows = (d.alerts||[]).map(a => `<tr><td>${a.id||''}</td><td>${a.device_id||'—'}</td><td>${a.alert_type||'—'}</td><td>${a.severity||'—'}</td><td style="font-family:monospace">${a.ai_score!=null?Number(a.ai_score).toFixed(3):'—'}</td><td>${fmt(a.timestamp)}</td><td>${a.resolved?'✓':'⚠'}</td></tr>`).join('');
  const objRows   = (d.top_classes||[]).map(c => `<tr><td>${c.class_name}</td><td>${c.cnt}</td></tr>`).join('');
  return wrap(rHeader('Threat Detection Report', null, meta) +
    kRow([kBox(s.total_alerts,'Alerts','#dc2626'), kBox(s.critical_alerts,'Critical','#b91c1c'), kBox(s.high_alerts,'High','#c2410c'), kBox(s.total_object_detections,'Objects','#0891b2')], 4) +
    `<h3>Top Detected Classes</h3><table><thead><tr><th>Class</th><th>Count</th></tr></thead><tbody>${objRows||'<tr><td colspan="2">None</td></tr>'}</tbody></table>` +
    `<h3>Alert Log</h3><table><thead><tr><th>#</th><th>Device</th><th>Type</th><th>Severity</th><th>Score</th><th>Time</th><th>Status</th></tr></thead><tbody>${alertRows||'<tr><td colspan="7">No alerts</td></tr>'}</tbody></table>`
  );
}
function buildCameras(d, meta) {
  const s = d.summary;
  const camRows = (d.cameras||[]).map(c => `<tr><td>${c.name}</td><td>${c.location||'—'}</td><td>${c.enabled?'Online':'Off'}</td><td>${c.face_recognition_enabled?'Yes':'No'}</td><td>${c.face_detections}</td><td>${c.authorized_persons}</td><td>${c.unknown_persons}</td><td>${c.object_detections}</td></tr>`).join('');
  return wrap(rHeader('Camera Activity Report', null, meta) +
    kRow([kBox(s.total_cameras,'Cameras','#0284c7'), kBox(s.total_face_detections,'Faces','#7c3aed'), kBox(s.unknown_detections,'Unknown','#ea580c'), kBox(s.total_object_detections,'Objects','#0891b2')], 4) +
    `<h3>Camera Summary</h3><table><thead><tr><th>Name</th><th>Location</th><th>Status</th><th>FR</th><th>Faces</th><th>Auth</th><th>Unknown</th><th>Objects</th></tr></thead><tbody>${camRows||'<tr><td colspan="8">No cameras</td></tr>'}</tbody></table>`
  );
}
function buildFaces(d, meta) {
  const s = d.summary;
  const personRows = (d.top_persons||[]).map(p => `<tr><td>${p.name}</td><td style="font-family:monospace">${p.employee_id||'—'}</td><td>${p.role||'—'}</td><td>${p.department||'—'}</td><td style="color:${p.authorized?'#4ade80':'#f87171'}">${p.authorized?'Auth':'Unauth'}</td><td>${p.appearances}</td></tr>`).join('');
  const fdRows     = (d.face_detections||[]).slice(0,100).map(fd => `<tr><td style="font-size:10px">${fmt(fd.timestamp)}</td><td>${fd.camera_name||'—'}</td><td>${fd.person_name||'Unknown'}</td><td style="color:${fd.authorized?'#4ade80':fd.person_name?'#f87171':'#fde047'}">${fd.authorized?'✓ Auth':fd.person_name?'✗ Unauth':'? Unknown'}</td><td>${fd.confidence!=null?(fd.confidence*100).toFixed(1)+'%':'—'}</td></tr>`).join('');
  return wrap(rHeader('Face Recognition Report', null, meta) +
    kRow([kBox(s.total_face_detections,'Detections','#7c3aed'), kBox(s.authorized_detections,'Authorised','#059669'), kBox(s.unknown_detections,'Unknown','#ea580c'), kBox(s.total_persons,'Registered','#0284c7')], 4) +
    `<h3>Most Frequent Persons</h3><table><thead><tr><th>Name</th><th>Employee ID</th><th>Role</th><th>Dept</th><th>Status</th><th>Appearances</th></tr></thead><tbody>${personRows||'<tr><td colspan="6">No data</td></tr>'}</tbody></table>` +
    `<h3>Detection Log (latest 100)</h3><table><thead><tr><th>Time</th><th>Camera</th><th>Person</th><th>Status</th><th>Confidence</th></tr></thead><tbody>${fdRows||'<tr><td colspan="5">No detections</td></tr>'}</tbody></table>`
  );
}
function buildSensors(d, meta) {
  const s = d.summary;
  const devRows     = (d.sensor_summary||[]).map(r => `<tr><td>${r.device_id}</td><td>${r.reading_count}</td><td>${r.avg_temp!=null?r.avg_temp+'°C':'—'}</td><td>${r.min_temp!=null?r.min_temp+'°C':'—'}</td><td>${r.max_temp!=null?r.max_temp+'°C':'—'}</td><td>${r.avg_hum!=null?r.avg_hum+'%':'—'}</td><td>${r.motion_events}</td></tr>`).join('');
  const readingRows = (d.sensor_readings||[]).slice(0,50).map(r => `<tr><td style="font-size:10px">${fmt(r.timestamp)}</td><td>${r.device_id}</td><td>${r.temperature!=null?r.temperature+'°C':'—'}</td><td>${r.humidity!=null?r.humidity+'%':'—'}</td><td>${r.motion?'⚠ YES':'—'}</td><td>${r.alert_type||'NORMAL'}</td></tr>`).join('');
  return wrap(rHeader('Sensor / IoT Report', null, meta) +
    kRow([kBox(s.total_readings,'Readings','#6366f1'), kBox((d.devices||[]).length,'Devices','#0284c7'), kBox((d.sensor_summary||[]).reduce((a,r)=>a+(r.motion_events||0),0),'Motion','#ea580c'), kBox(s.total_alerts,'Alerts','#dc2626')], 4) +
    `<h3>Device Summary</h3><table><thead><tr><th>Device</th><th>Readings</th><th>Avg Temp</th><th>Min</th><th>Max</th><th>Avg Hum</th><th>Motion</th></tr></thead><tbody>${devRows||'<tr><td colspan="7">No devices</td></tr>'}</tbody></table>` +
    `<h3>Recent Readings (50)</h3><table><thead><tr><th>Time</th><th>Device</th><th>Temp</th><th>Humidity</th><th>Motion</th><th>Type</th></tr></thead><tbody>${readingRows||'<tr><td colspan="6">No readings</td></tr>'}</tbody></table>`
  );
}
function buildForensic(d, meta) {
  const caseId = 'CASE-' + new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
  const dateStr = new Date().toISOString().replace(/[^0-9]/g,'').slice(0,8);
  let idx = 1;
  const allEvents = [];
  (d.alerts||[]).forEach(a => allEvents.push({ evdId:'EVD-'+dateStr+'-'+String(idx++).padStart(4,'0'), ts:a.timestamp, type:'ALERT', source:a.device_id||'—', detail:(a.alert_type||'')+(a.severity?' ('+a.severity+')':''), confidence:a.ai_score!=null?(Number(a.ai_score)*100).toFixed(1)+'%':'—', severity:a.severity||'LOW', acqMethod:'AI Behaviour Engine' }));
  (d.face_detections||[]).forEach(f => allEvents.push({ evdId:'EVD-'+dateStr+'-'+String(idx++).padStart(4,'0'), ts:f.timestamp, type:'FACE', source:f.camera_name||'—', detail:f.person_name||'Unknown', confidence:f.confidence!=null?(f.confidence*100).toFixed(1)+'%':'—', severity:f.authorized===false&&f.person_name?'MEDIUM':!f.authorized&&!f.person_name?'HIGH':'LOW', acqMethod:'Facial Recognition (dlib)' }));
  (d.object_detections||[]).forEach(o => allEvents.push({ evdId:'EVD-'+dateStr+'-'+String(idx++).padStart(4,'0'), ts:o.timestamp, type:'OBJECT', source:o.camera_name||'—', detail:o.class_name, confidence:o.confidence!=null?(o.confidence*100).toFixed(1)+'%':'—', severity:'INFO', acqMethod:'YOLOv8 Object Detection' }));
  allEvents.sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));
  const sevColor = sv => sv==='CRITICAL'?'#ef4444':sv==='HIGH'?'#f97316':sv==='MEDIUM'?'#eab308':'#22c55e';
  const typeBadgeHtml = t => `<span style="background:${t==='ALERT'?'#450a0a':t==='FACE'?'#2e1065':'#083344'};color:${t==='ALERT'?'#fca5a5':t==='FACE'?'#c4b5fd':'#a5f3fc'};padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600">${t}</span>`;
  const evRows = allEvents.slice(0,50).map(e => `<tr><td style="font-family:monospace;font-size:9px;color:#6ee7b7">${e.evdId}</td><td>${typeBadgeHtml(e.type)}</td><td style="font-size:10px">${fmt(e.ts)}</td><td>${e.source}</td><td>${e.detail}</td><td>${e.confidence}</td><td style="color:${sevColor(e.severity)}">${e.severity}</td></tr>`).join('');
  const metaBlock = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px;font-size:10px">${[['Case ID',caseId],['Classification','CONFIDENTIAL'],['Standards','NIST SP 800-86 · ISO 27037'],['Evidence Period',(meta.from||'all')+' → '+(meta.to||'now')],['Generated',meta.generatedAt],['Total Items',allEvents.length]].map(([k,v])=>`<div style="border:1px solid #e2e8f0;border-radius:4px;padding:8px"><div style="color:#94a3b8;font-size:9px;text-transform:uppercase">${k}</div><div style="font-weight:600;margin-top:2px">${v}</div></div>`).join('')}</div>`;
  const cocRows = [['1','AI Detection Engine (YOLOv8/dlib)',meta.generatedAt,'Evidence collected via automated AI analysis','✓ Automated'],['2','SmartCity Backend (Flask/SQLite)',meta.generatedAt,'Stored in tamper-evident SQLite DB','✓ DB integrity'],['3','Report Generator',meta.generatedAt,'Evidence aggregated with unique EVD IDs','✓ Sequential IDs'],['4','Operator',meta.generatedAt,'Report exported for review','⚠ Manual review']].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td style="color:${r[4].startsWith('✓')?'#4ade80':'#fde047'}">${r[4]}</td></tr>`).join('');
  const simpleHash = allEvents.length * 31 + (d.alerts||[]).length * 17 + (d.face_detections||[]).length * 13;
  const footer = `<div style="border:1px solid #1e3a5f;background:#f8fafc;padding:12px;margin-top:16px;border-radius:4px;font-size:10px"><div style="font-weight:700;margin-bottom:6px">REPORT INTEGRITY STATEMENT</div><div style="color:#64748b">Generated by SmartCity AI Security Platform per NIST SP 800-86, ISO/IEC 27037:2012, ACPO Good Practice Guide. Evidence items have been assigned unique identifiers and chain of custody documented.</div><div style="display:flex;gap:24px;margin-top:8px;flex-wrap:wrap"><span><strong>Generated:</strong> ${meta.generatedAt}</span><span><strong>Items:</strong> ${allEvents.length}</span><span><strong>Case:</strong> ${caseId}</span><span><strong>Checksum:</strong> 0x${simpleHash.toString(16).toUpperCase().padStart(8,'0')}</span></div></div>`;
  return wrap(rHeader('Digital Forensic Investigation Report','Case '+caseId+' · '+allEvents.length+' evidence items',meta) +
    metaBlock +
    kRow([kBox(allEvents.length,'Total Evidence','#374151'),kBox((d.alerts||[]).length,'Alerts','#dc2626'),kBox((d.face_detections||[]).length,'Face Events','#7c3aed'),kBox((d.object_detections||[]).length,'Object Events','#0891b2')],4) +
    `<h3>§1 Evidence Inventory (first 50 of ${allEvents.length})</h3><table><thead><tr><th>Evidence ID</th><th>Type</th><th>Timestamp</th><th>Source</th><th>Detail</th><th>Confidence</th><th>Severity</th></tr></thead><tbody>${evRows||'<tr><td colspan="7">No evidence</td></tr>'}</tbody></table>` +
    `<h3>§2 Chain of Custody</h3><table><thead><tr><th>Step</th><th>Custodian</th><th>Date/Time</th><th>Action</th><th>Integrity</th></tr></thead><tbody>${cocRows}</tbody></table>` +
    footer);
}

/* ── Section (collapsible) ── */
function Section({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Paper variant="outlined" sx={{ mb: 1.5, overflow: 'hidden' }}>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, transition: 'background 0.15s' }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {Icon && <Icon size={14} />}
        <Typography variant="subtitle2" fontWeight={600}>{title}</Typography>
      </Box>
      <Collapse in={open}>
        <Divider />
        <Box sx={{ p: 2 }}>{children}</Box>
      </Collapse>
    </Paper>
  );
}

/* ── KpiCard ── */
function KpiCard({ value, label, color = 'text.primary' }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ textAlign: 'center', py: '12px !important' }}>
        <Typography variant="h4" fontWeight={700} color={color}>{value ?? 0}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </CardContent>
    </Card>
  );
}

/* ── PTable ── */
function PTable({ cols, rows, empty = 'No data' }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {cols.map(c => <TableCell key={c}><Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.62rem' }}>{c}</Typography></TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {!rows.length
            ? <TableRow><TableCell colSpan={cols.length} align="center"><Typography variant="caption" color="text.disabled">{empty}</Typography></TableCell></TableRow>
            : rows.map((r, i) => (
                <TableRow key={i} hover>
                  {r.map((cell, j) => <TableCell key={j}><Typography variant="caption">{cell}</Typography></TableCell>)}
                </TableRow>
              ))
          }
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/* ── SevBadge ── */
const SEV_COLOR = { CRITICAL: 'error', HIGH: 'warning', MEDIUM: 'info', LOW: 'success' };
function SevBadge({ s }) {
  return <Chip label={s} color={SEV_COLOR[s] || 'default'} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />;
}

/* ── Report types ── */
const REPORT_TYPES = [
  { id: 'executive', label: 'Executive',  icon: Activity      },
  { id: 'threats',   label: 'Threats',    icon: AlertTriangle  },
  { id: 'cameras',   label: 'Cameras',    icon: Camera         },
  { id: 'faces',     label: 'Faces',      icon: User           },
  { id: 'sensors',   label: 'Sensors',    icon: Thermometer    },
  { id: 'forensic',  label: 'Forensic',   icon: Search         },
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
    const builders = { executive: buildExecutive, threats: buildThreats, cameras: buildCameras, faces: buildFaces, sensors: buildSensors, forensic: buildForensic };
    printHtml((builders[rType] || buildExecutive)(data, meta()));
  };

  const handleCsv = () => {
    if (!data) return;
    let rows = [], name = 'report_' + rType + '_' + today;
    if (rType === 'executive' || rType === 'threats') { rows = data.alerts || []; name = 'alerts_' + from + '_' + to; }
    else if (rType === 'cameras') { rows = (data.cameras || []).map(c => ({ name: c.name, location: c.location, faces: c.face_detections, auth: c.authorized_persons, unknown: c.unknown_persons, objects: c.object_detections })); name = 'cameras_' + from + '_' + to; }
    else if (rType === 'faces')   { rows = data.face_detections   || []; name = 'faces_'   + from + '_' + to; }
    else if (rType === 'sensors') { rows = data.sensor_readings   || []; name = 'sensors_' + from + '_' + to; }
    else if (rType === 'forensic') {
      const events = [];
      (data.alerts||[]).forEach(a => events.push({ type:'ALERT', ts:a.timestamp, source:a.device_id, detail:a.alert_type, severity:a.severity }));
      (data.face_detections||[]).forEach(f => events.push({ type:'FACE', ts:f.timestamp, source:f.camera_name, detail:f.person_name||'Unknown', severity:f.authorized?'AUTH':'UNKNOWN' }));
      (data.object_detections||[]).forEach(o => events.push({ type:'OBJECT', ts:o.timestamp, source:o.camera_name, detail:o.class_name, severity:'INFO' }));
      events.sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));
      rows = events; name = 'forensic_' + from + '_' + to;
    }
    downloadCsv(rows, name + '.csv');
  };

  const s = data?.summary || {};

  const renderPreview = () => {
    if (!data) return null;

    if (rType === 'executive') return (<>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
        <KpiCard value={s.total_alerts}           label="Total Alerts"       color="error.main"   />
        <KpiCard value={s.critical_alerts}        label="Critical"           color="error.light"  />
        <KpiCard value={s.total_face_detections}  label="Face Detections"    color="secondary.main" />
        <KpiCard value={s.total_cameras}          label="Active Cameras"     color="info.main"    />
        <KpiCard value={s.unknown_detections}     label="Unknown Persons"    color="warning.main" />
        <KpiCard value={s.authorized_detections}  label="Authorised"         color="success.main" />
        <KpiCard value={s.total_object_detections}label="Objects Detected"   color="info.dark"    />
        <KpiCard value={s.total_readings}         label="Sensor Readings"    color="primary.main" />
      </Box>
      <Section title="Alert Type Breakdown" icon={AlertTriangle}>
        <PTable cols={['Type','Count','%']} rows={Object.entries(data.alert_type_counts||{}).map(([t,c])=>[t,c,pct(c,s.total_alerts)])} />
      </Section>
      <Section title="Camera Activity" icon={Camera}>
        <PTable cols={['Camera','Location','Faces','Auth','Unknown','Objects']} rows={(data.cameras||[]).map(c=>[c.name,c.location||'—',c.face_detections,c.authorized_persons,c.unknown_persons,c.object_detections])} />
      </Section>
    </>);

    if (rType === 'threats') return (<>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
        <KpiCard value={s.total_alerts}            label="Total Alerts"  color="error.main"   />
        <KpiCard value={s.critical_alerts}         label="Critical"      color="error.light"  />
        <KpiCard value={s.high_alerts}             label="High"          color="warning.main" />
        <KpiCard value={s.total_object_detections} label="Objects"       color="info.main"    />
      </Box>
      <Section title="Top Detected Classes" icon={Search}>
        <PTable cols={['Object Class','Count']} rows={(data.top_classes||[]).map(c=>[c.class_name,c.cnt])} />
      </Section>
      <Section title="Alert Log (latest 50)" icon={AlertTriangle}>
        <PTable cols={['#','Device','Type','Severity','Score','Time','Status']}
          rows={(data.alerts||[]).slice(0,50).map(a=>[a.id,a.device_id||'—',a.alert_type||'—',<SevBadge key={a.id} s={a.severity}/>,a.ai_score!=null?Number(a.ai_score).toFixed(3):'—',fmt(a.timestamp),<Chip key={'st'+a.id} label={a.resolved?'✓':'⚠'} color={a.resolved?'success':'error'} size="small" variant="outlined" sx={{fontSize:'0.6rem',height:18}}/>])}
        />
      </Section>
    </>);

    if (rType === 'cameras') return (<>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
        <KpiCard value={s.total_cameras}           label="Cameras"        color="info.main"    />
        <KpiCard value={s.total_face_detections}   label="Face Events"    color="secondary.main" />
        <KpiCard value={s.total_object_detections} label="Object Events"  color="info.dark"    />
        <KpiCard value={s.unknown_detections}      label="Unknown Persons"color="warning.main" />
      </Box>
      <Section title="Camera Summary" icon={Camera}>
        <PTable cols={['Name','Location','Status','FR','Faces','Auth','Unknown','Objects']}
          rows={(data.cameras||[]).map(c=>[c.name,c.location||'—',
            <Chip key={c.id+'s'} label={c.enabled?'Online':'Off'} color={c.enabled?'success':'error'} size="small" variant="outlined" sx={{fontSize:'0.6rem',height:18}}/>,
            <Chip key={c.id+'fr'} label={c.face_recognition_enabled?'Yes':'No'} color={c.face_recognition_enabled?'info':'default'} size="small" variant="outlined" sx={{fontSize:'0.6rem',height:18}}/>,
            c.face_detections,c.authorized_persons,c.unknown_persons,c.object_detections])}
        />
      </Section>
    </>);

    if (rType === 'faces') return (<>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
        <KpiCard value={s.total_face_detections} label="Total Detections" color="secondary.main" />
        <KpiCard value={s.authorized_detections} label="Authorised"       color="success.main"   />
        <KpiCard value={s.unknown_detections}    label="Unknown"          color="warning.main"   />
        <KpiCard value={s.total_persons}         label="Registered"       color="info.main"      />
      </Box>
      <Section title="Most Frequent Persons" icon={User}>
        <PTable cols={['Name','ID','Role','Dept','Status','Appearances']} rows={(data.top_persons||[]).map(p=>[p.name,p.employee_id||'—',p.role||'—',p.department||'—',<Chip key={p.name} label={p.authorized?'Auth':'Unauth'} color={p.authorized?'success':'error'} size="small" variant="outlined" sx={{fontSize:'0.6rem',height:18}}/>,<strong key={'c'+p.name}>{p.appearances}</strong>])} />
      </Section>
      <Section title="Detection Log (latest 50)" icon={Search}>
        <PTable cols={['Time','Camera','Person','Status','Confidence']} rows={(data.face_detections||[]).slice(0,50).map(fd=>[fmt(fd.timestamp),fd.camera_name||'—',fd.person_name||<em key={fd.id}>Unknown</em>,<Chip key={'s'+fd.id} label={fd.authorized?'✓ Auth':fd.person_name?'✗ Unauth':'? Unknown'} color={fd.authorized?'success':fd.person_name?'error':'warning'} size="small" variant="outlined" sx={{fontSize:'0.6rem',height:18}}/>,fd.confidence!=null?(fd.confidence*100).toFixed(1)+'%':'—'])} />
      </Section>
    </>);

    if (rType === 'sensors') {
      const totalMotion = (data.sensor_summary||[]).reduce((a,d)=>a+(d.motion_events||0),0);
      return (<>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
          <KpiCard value={s.total_readings}      label="Total Readings" color="primary.main"  />
          <KpiCard value={(data.devices||[]).length} label="IoT Devices" color="info.main"    />
          <KpiCard value={totalMotion}            label="Motion Events"  color="warning.main" />
          <KpiCard value={s.total_alerts}         label="Sensor Alerts"  color="error.main"   />
        </Box>
        <Section title="Device Summary" icon={Thermometer}>
          <PTable cols={['Device','Readings','Avg Temp','Min','Max','Avg Hum','Motion']} rows={(data.sensor_summary||[]).map(d=>[d.device_id,d.reading_count,d.avg_temp!=null?d.avg_temp+'°C':'—',d.min_temp!=null?d.min_temp+'°C':'—',d.max_temp!=null?d.max_temp+'°C':'—',d.avg_hum!=null?d.avg_hum+'%':'—',d.motion_events])} />
        </Section>
        <Section title="Recent Readings (30)" icon={Activity}>
          <PTable cols={['Time','Device','Temp','Humidity','Motion','Type']} rows={(data.sensor_readings||[]).slice(0,30).map(r=>[fmt(r.timestamp),r.device_id,r.temperature!=null?r.temperature+'°C':'—',r.humidity!=null?r.humidity+'%':'—',r.motion?<Chip key={r.id+'m'} label="⚠" color="warning" size="small" variant="outlined" sx={{fontSize:'0.6rem',height:18}}/>:'—',r.alert_type||'NORMAL'])} />
        </Section>
      </>);
    }

    if (rType === 'forensic') {
      const fDateStr = new Date().toISOString().replace(/[^0-9]/g,'').slice(0,8);
      const fCaseId  = 'CASE-' + new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
      let fIdx = 1;
      const allEvents = [];
      (data.alerts||[]).forEach(a => allEvents.push({ evdId:'EVD-'+fDateStr+'-'+String(fIdx++).padStart(4,'0'), ts:a.timestamp, type:'ALERT', source:a.device_id||'—', detail:(a.alert_type||'')+(a.severity?' ('+a.severity+')':''), confidence:a.ai_score!=null?(Number(a.ai_score)*100).toFixed(1)+'%':'—', severity:a.severity||'LOW' }));
      (data.face_detections||[]).forEach(f => allEvents.push({ evdId:'EVD-'+fDateStr+'-'+String(fIdx++).padStart(4,'0'), ts:f.timestamp, type:'FACE', source:f.camera_name||'—', detail:f.person_name||'Unknown', confidence:f.confidence!=null?(f.confidence*100).toFixed(1)+'%':'—', severity:f.authorized===false&&f.person_name?'MEDIUM':!f.authorized&&!f.person_name?'HIGH':'LOW' }));
      (data.object_detections||[]).forEach(o => allEvents.push({ evdId:'EVD-'+fDateStr+'-'+String(fIdx++).padStart(4,'0'), ts:o.timestamp, type:'OBJECT', source:o.camera_name||'—', detail:o.class_name, confidence:o.confidence!=null?(o.confidence*100).toFixed(1)+'%':'—', severity:'INFO' }));
      allEvents.sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));

      const typeBadge = t => <Chip key={t} label={t} color={t==='ALERT'?'error':t==='FACE'?'secondary':'info'} size="small" variant="outlined" sx={{fontSize:'0.6rem',height:18}}/>;
      const sevColor  = sv => sv==='CRITICAL'?'error.main':sv==='HIGH'?'warning.main':sv==='MEDIUM'?'info.main':sv==='INFO'?'text.disabled':'success.main';

      return (<>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(5,1fr)' }, gap: 1.5, mb: 2 }}>
          <KpiCard value={allEvents.length}               label="Evidence Items" color="text.primary"    />
          <KpiCard value={(data.alerts||[]).length}       label="Alert Events"   color="error.main"      />
          <KpiCard value={(data.face_detections||[]).length} label="Face Events" color="secondary.main"  />
          <KpiCard value={(data.object_detections||[]).length} label="Objects"   color="info.main"       />
          <KpiCard value={(data.sensor_readings||[]).filter(r=>r.motion).length} label="Sensor Triggers" color="warning.main" />
        </Box>
        <Section title="Case Metadata" icon={Search}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1 }}>
            {[['Case ID',fCaseId],['Classification','CONFIDENTIAL'],['Standards','NIST SP 800-86 · ISO 27037'],['Period',(from||'all')+' → '+(to||'now')],['Generated',meta().generatedAt],['Total Items',allEvents.length]].map(([k,v])=>(
              <Paper key={k} variant="outlined" sx={{ p: 1.25 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize:'0.6rem', textTransform:'uppercase', letterSpacing:0.5 }}>{k}</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ mt:0.25, wordBreak:'break-all' }}>{v}</Typography>
              </Paper>
            ))}
          </Box>
        </Section>
        <Section title={`§1 Evidence Inventory (first 50 of ${allEvents.length})`} icon={Search}>
          <PTable cols={['Evidence ID','Type','Timestamp','Source','Detail','Confidence']}
            rows={allEvents.slice(0,50).map((e,i)=>[<Typography key={i} variant="caption" fontFamily="monospace" color="success.main">{e.evdId}</Typography>,typeBadge(e.type),<Typography key={'t'+i} variant="caption" sx={{whiteSpace:'nowrap'}}>{fmt(e.ts)}</Typography>,e.source,e.detail,e.confidence])}
          />
        </Section>
        <Section title={`§2 Forensic Timeline (first 100 of ${allEvents.length})`} icon={Search} defaultOpen={false}>
          <PTable cols={['Evidence ID','Timestamp','Type','Source','Detail','Severity']}
            rows={allEvents.slice(0,100).map((e,i)=>[<Typography key={i} variant="caption" fontFamily="monospace" color="success.main">{e.evdId}</Typography>,<Typography key={'t'+i} variant="caption" sx={{whiteSpace:'nowrap'}}>{fmt(e.ts)}</Typography>,typeBadge(e.type),e.source,e.detail,<Typography key={'sv'+i} variant="caption" color={sevColor(e.severity)} fontWeight={600}>{e.severity}</Typography>])}
          />
        </Section>
        <Section title="§3 Chain of Custody" icon={Search} defaultOpen={false}>
          <PTable cols={['Step','Custodian','Date/Time','Action','Integrity']}
            rows={[['1','AI Detection Engine (YOLOv8/dlib)',meta().generatedAt,'Evidence collected via automated AI analysis','✓ Automated'],['2','SmartCity Backend (Flask/SQLite)',meta().generatedAt,'Stored in tamper-evident SQLite DB','✓ DB integrity'],['3','Report Generator',meta().generatedAt,'Evidence aggregated with unique EVD IDs','✓ Sequential IDs'],['4','Operator',meta().generatedAt,'Report exported for review','⚠ Manual review']].map((r,i)=>[<strong key={i}>{r[0]}</strong>,r[1],<Typography key={'t'+i} variant="caption" sx={{whiteSpace:'nowrap'}}>{r[2]}</Typography>,r[3],<Typography key={'g'+i} variant="caption" color={r[4].startsWith('✓')?'success.main':'warning.main'}>{r[4]}</Typography>])}
          />
        </Section>
      </>);
    }

    return null;
  };

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>Report Center</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Generate, preview, and export security reports</Typography>

      {/* Report type selector */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>Report Type</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3,1fr)', sm: 'repeat(6,1fr)' }, gap: 1 }}>
            {REPORT_TYPES.map(t => {
              const Icon = t.icon;
              const active = rType === t.id;
              return (
                <Paper
                  key={t.id}
                  variant="outlined"
                  onClick={() => setRType(t.id)}
                  sx={{
                    p: 1.5, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: active ? 'primary.main' : 'divider',
                    bgcolor: active ? 'primary.light' : 'background.paper',
                    '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
                    <Icon size={18} color={active ? '#1565C0' : undefined} />
                    <Typography variant="caption" fontWeight={active ? 700 : 400} color={active ? 'primary.main' : 'text.secondary'}>{t.label}</Typography>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end' }}>
            <TextField label="From" type="date" size="small" value={from} onChange={e => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="To"   type="date" size="small" value={to}   onChange={e => setTo(e.target.value)}   InputLabelProps={{ shrink: true }} />
            <TextField select label="Camera" size="small" value={camId} onChange={e => setCamId(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">All Cameras</MenuItem>
              {cams.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <Button variant="contained" onClick={load} disabled={loading} startIcon={loading ? <CircularProgress size={14} /> : <RefreshCw size={14} />}>
              {loading ? 'Loading…' : 'Load Report'}
            </Button>
            {data && <>
              <Button variant="outlined" startIcon={<Printer size={14} />} onClick={handlePrint}>Print / PDF</Button>
              <Button variant="outlined" startIcon={<Download size={14} />} onClick={handleCsv}>Export CSV</Button>
            </>}
          </Box>
          {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
        </CardContent>
      </Card>

      {/* Preview */}
      {data ? (
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={700}>{REPORT_TYPES.find(t => t.id === rType)?.label} — Preview</Typography>
              <Typography variant="caption" color="text.secondary">{from} → {to}{camId ? ' · ' + (cams.find(c => String(c.id) === String(camId))?.name || 'Camera ' + camId) : ' · All Cameras'}</Typography>
            </Box>
            {renderPreview()}
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Printer size={48} color="#9e9e9e" style={{ marginBottom: 12 }} />
            <Typography variant="h6" color="text.secondary">No report loaded</Typography>
            <Typography variant="body2" color="text.disabled">Select a date range and click <strong>Load Report</strong></Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

