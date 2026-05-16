import React, { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import {
  Camera, Plus, Edit2, Trash2, EyeOff,
  Wifi, WifiOff, MapPin, RefreshCw, LayoutGrid, List, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../apiBase';
import CameraModal from './CameraModal';
import getSocket from '../socketClient';

function parseBBoxList(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(Boolean).map((box) => {
      const left   = Number(box.left ?? box.x ?? 0);
      const top    = Number(box.top ?? box.y ?? 0);
      const right  = Number(box.right ?? (box.x != null && box.width != null ? Number(box.x) + Number(box.width) : 0));
      const bottom = Number(box.bottom ?? (box.y != null && box.height != null ? Number(box.y) + Number(box.height) : 0));
      return { left, top, right, bottom };
    }).filter((box) => [box.left, box.top, box.right, box.bottom].every(Number.isFinite));
  } catch (_) { return []; }
}

function parseDbTimestamp(timestamp) {
  if (!timestamp) return null;
  const normalized = String(timestamp).trim();
  const isoLike = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  const candidates = [
    new Date(isoLike.endsWith('Z') ? isoLike : `${isoLike}Z`),
    new Date(`${normalized} UTC`),
  ];
  for (const candidate of candidates) {
    const ms = candidate.getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

function LiveFeed({ camera, onDetectionMetadata }) {
  const online = camera.online !== false;
  const [streamError, setStreamError]       = useState(false);
  const [loading, setLoading]               = useState(true);
  const [latestDetection, setLatestDetection] = useState(null);
  const [overlayBoxes, setOverlayBoxes]     = useState([]);
  const [objectBoxes, setObjectBoxes]       = useState([]);
  const [threatAlert, setThreatAlert]       = useState(null);
  const threatTimerRef  = useRef(null);
  const imgRef          = useRef(null);
  const canvasRef       = useRef(null);
  const streamNonceRef  = useRef(Date.now());
  const streamUrl       = `/api/cameras/${camera.id}/mjpeg?fps=5&t=${streamNonceRef.current}`;

  useEffect(() => {
    let cancelled = false;
    getSocket().then((sock) => {
      if (cancelled) return;
      const onFace = (data) => {
        if (data.camera_id !== camera.id) return;
        const boxes = parseBBoxList(data.bbox_json);
        setLatestDetection({ ...data, timestamp: data.timestamp });
        setOverlayBoxes(boxes);
        if (onDetectionMetadata) {
          onDetectionMetadata({ latestDetection: data, detectionCount: 1, detectionAge: 0, overlayBoxes: boxes, analysisMethod: data.method || 'dlib', faceCount: data.face_count || boxes.length });
        }
      };
      const onThreat = (data) => {
        if (data.camera_id !== camera.id) return;
        setThreatAlert(data);
        clearTimeout(threatTimerRef.current);
        threatTimerRef.current = setTimeout(() => setThreatAlert(null), 15000);
      };
      sock.on('face_detected',   onFace);
      sock.on('threat_detected', onThreat);
      sock.on('weapon_detected', onThreat);
      return () => { sock.off('face_detected', onFace); sock.off('threat_detected', onThreat); sock.off('weapon_detected', onThreat); };
    });
    return () => { cancelled = true; clearTimeout(threatTimerRef.current); };
  }, [camera.id, onDetectionMetadata]);

  useEffect(() => { setStreamError(false); setLoading(true); streamNonceRef.current = Date.now(); }, [camera.id]);

  useEffect(() => {
    let cancelled = false;
    const loadLatestDetection = async () => {
      try {
        const res  = await apiFetch(`/face-detections?camera_id=${camera.id}&hours=1&limit=100`);
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.data)) {
          const latest = data.data[0] || null;
          const boxes  = parseBBoxList(latest?.bbox_json);
          setLatestDetection(data.data.length > 0 ? latest : null);
          setOverlayBoxes(boxes);
          if (onDetectionMetadata) {
            onDetectionMetadata({ latestDetection: latest, detectionCount: data.data.length, detectionAge: latest?.timestamp ? Math.abs(Date.now() - parseDbTimestamp(latest.timestamp)) : null, overlayBoxes: boxes, analysisMethod: latest?.analysis_method || 'opencv', faceCount: latest?.face_count || boxes.length });
          }
        } else if (!cancelled) {
          setLatestDetection(null); setOverlayBoxes([]);
          if (onDetectionMetadata) onDetectionMetadata({ latestDetection: null, detectionCount: 0, detectionAge: null, overlayBoxes: [], analysisMethod: 'opencv', faceCount: 0 });
        }
      } catch (_) {
        if (!cancelled) { setLatestDetection(null); setOverlayBoxes([]); if (onDetectionMetadata) onDetectionMetadata({ latestDetection: null, detectionCount: 0, detectionAge: null, overlayBoxes: [], analysisMethod: 'opencv', faceCount: 0 }); }
      }
    };
    loadLatestDetection();
    const iv = setInterval(loadLatestDetection, 2000);
    let objCancelled = false;
    const loadObjects = async () => {
      try {
        const res  = await apiFetch(`/cameras/${camera.id}/object-detections?hours=0.1`);
        const data = await res.json();
        if (!objCancelled && data.success && Array.isArray(data.data)) {
          setObjectBoxes(data.data.map(d => ({ ...parseBBoxList(d.bbox_json)[0], class_name: d.class_name, confidence: d.confidence, timestamp: d.timestamp })).filter(b => b && b.left != null));
        }
      } catch (_) {}
    };
    loadObjects();
    const objIv = setInterval(loadObjects, 2000);
    return () => { cancelled = true; clearInterval(iv); objCancelled = true; clearInterval(objIv); };
  }, [camera.id, onDetectionMetadata]);

  const detectionAgeMs  = latestDetection?.timestamp ? Math.abs(Date.now() - parseDbTimestamp(latestDetection.timestamp)) : Number.MAX_SAFE_INTEGER;
  const detectionFresh  = detectionAgeMs <= 15_000;
  const faceCount       = latestDetection?.face_count || overlayBoxes.length;
  const isKnown         = Boolean(latestDetection?.person_id);
  const isAuthorized    = latestDetection?.person_authorized === 1;
  const analysisMethod  = latestDetection?.analysis_method || 'opencv';

  const redrawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !img.complete || !img.naturalWidth || !img.naturalHeight) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sourceWidth   = latestDetection?.frame_width  || img.naturalWidth;
    const sourceHeight  = latestDetection?.frame_height || img.naturalHeight;
    const sourceAspect  = sourceWidth / sourceHeight;
    const containerAspect = rect.width / rect.height;
    let renderWidth = rect.width, renderHeight = rect.height, offsetX = 0, offsetY = 0;
    if (containerAspect > sourceAspect) {
      renderHeight = rect.height; renderWidth = renderHeight * sourceAspect; offsetX = (rect.width - renderWidth) / 2;
    } else {
      renderWidth = rect.width; renderHeight = renderWidth / sourceAspect; offsetY = (rect.height - renderHeight) / 2;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width  = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const toCanvas = (box) => ({ x: offsetX + Math.max(0, Math.min(1, box.left)) * renderWidth, y: offsetY + Math.max(0, Math.min(1, box.top)) * renderHeight, w: Math.max(0, Math.min(1, box.right - box.left)) * renderWidth, h: Math.max(0, Math.min(1, box.bottom - box.top)) * renderHeight });
    if (detectionFresh && overlayBoxes.length > 0) {
      const isFR = analysisMethod === 'face_recognition';
      overlayBoxes.forEach((box, index) => {
        const { x, y, w, h } = toCanvas(box);
        let strokeColor, shadowColor, labelBg, labelText;
        if (!isFR) { strokeColor='#22c55e'; shadowColor='rgba(34,197,94,0.85)'; labelBg='rgba(5,46,22,0.88)'; labelText='#bbf7d0'; }
        else if (!isKnown) { strokeColor='#ef4444'; shadowColor='rgba(239,68,68,0.85)'; labelBg='rgba(69,10,10,0.9)'; labelText='#fecaca'; }
        else if (isAuthorized) { strokeColor='#22c55e'; shadowColor='rgba(34,197,94,0.85)'; labelBg='rgba(5,46,22,0.88)'; labelText='#bbf7d0'; }
        else { strokeColor='#f59e0b'; shadowColor='rgba(245,158,11,0.85)'; labelBg='rgba(69,26,3,0.9)'; labelText='#fde68a'; }
        ctx.save();
        ctx.strokeStyle = strokeColor; ctx.lineWidth = 3; ctx.shadowColor = shadowColor; ctx.shadowBlur = 10;
        ctx.strokeRect(x, y, w, h); ctx.shadowBlur = 0;
        let topLabel, subLabel;
        if (!isFR) { topLabel = `FACE ${index + 1}`; subLabel = null; }
        else if (!isKnown) { topLabel = 'UNKNOWN'; subLabel = 'No match in DB'; }
        else { topLabel = latestDetection?.person_name || 'Known'; const pct = latestDetection?.confidence != null ? ` ${Math.round(latestDetection.confidence * 100)}%` : ''; subLabel = `${isAuthorized ? '✓ AUTH' : '✗ UNAUTH'}${pct}`; }
        ctx.font = '700 12px Inter, system-ui, sans-serif';
        const textW = Math.max(ctx.measureText(topLabel).width, subLabel ? ctx.measureText(subLabel).width : 0);
        const labelH = subLabel ? 34 : 20;
        const labelW = textW + 18;
        const labelX = x;
        const labelY = Math.max(4, y - labelH - 2);
        ctx.fillStyle = labelBg; ctx.fillRect(labelX, labelY, labelW, labelH);
        ctx.strokeStyle = strokeColor; ctx.lineWidth = 1; ctx.strokeRect(labelX, labelY, labelW, labelH);
        ctx.fillStyle = labelText; ctx.font = '700 12px Inter, system-ui, sans-serif'; ctx.fillText(topLabel, labelX + 8, labelY + 14);
        if (subLabel) { ctx.font = '500 10px Inter, system-ui, sans-serif'; ctx.fillStyle = labelText; ctx.globalAlpha = 0.85; ctx.fillText(subLabel, labelX + 8, labelY + 28); ctx.globalAlpha = 1; }
        ctx.restore();
      });
    }
    const OBJ_AGE_LIMIT = 15000;
    const freshObjects  = objectBoxes.filter(ob => { const age = Math.abs(Date.now() - (parseDbTimestamp(ob.timestamp) || 0)); return age <= OBJ_AGE_LIMIT && ob.left != null; });
    const OBJ_COLORS    = { 'cell phone': {stroke:'#f97316',shadow:'rgba(249,115,22,0.85)',bg:'rgba(67,20,7,0.9)',text:'#fed7aa'}, knife:{stroke:'#ef4444',shadow:'rgba(239,68,68,0.85)',bg:'rgba(69,10,10,0.9)',text:'#fecaca'}, scissors:{stroke:'#ef4444',shadow:'rgba(239,68,68,0.85)',bg:'rgba(69,10,10,0.9)',text:'#fecaca'}, backpack:{stroke:'#3b82f6',shadow:'rgba(59,130,246,0.85)',bg:'rgba(7,25,65,0.9)',text:'#bfdbfe'}, handbag:{stroke:'#3b82f6',shadow:'rgba(59,130,246,0.85)',bg:'rgba(7,25,65,0.9)',text:'#bfdbfe'}, gun:{stroke:'#ef4444',shadow:'rgba(239,68,68,0.85)',bg:'rgba(69,10,10,0.9)',text:'#fecaca'}, default:{stroke:'#a855f7',shadow:'rgba(168,85,247,0.85)',bg:'rgba(46,16,101,0.9)',text:'#e9d5ff'} };
    freshObjects.forEach(ob => {
      if (ob.left == null || ob.right == null) return;
      const { x, y, w, h } = toCanvas(ob);
      const col   = OBJ_COLORS[ob.class_name] || OBJ_COLORS['default'];
      const pct   = ob.confidence != null ? ` ${Math.round(ob.confidence * 100)}%` : '';
      const label = `${(ob.class_name || 'object').toUpperCase()}${pct}`;
      ctx.save();
      ctx.strokeStyle = col.stroke; ctx.lineWidth = 2.5; ctx.setLineDash([6, 3]); ctx.shadowColor = col.shadow; ctx.shadowBlur = 8;
      ctx.strokeRect(x, y, w, h); ctx.setLineDash([]); ctx.shadowBlur = 0;
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      const lw = ctx.measureText(label).width + 14;
      const lx = x;
      const ly = Math.min(y + h + 2, rect.height - 22);
      ctx.fillStyle = col.bg; ctx.fillRect(lx, ly, lw, 20); ctx.strokeStyle = col.stroke; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, lw, 20);
      ctx.fillStyle = col.text; ctx.fillText(label, lx + 7, ly + 14);
      ctx.restore();
    });
  }, [detectionFresh, overlayBoxes, objectBoxes, latestDetection, analysisMethod, isKnown, isAuthorized]);

  useEffect(() => { redrawOverlay(); window.addEventListener('resize', redrawOverlay); return () => window.removeEventListener('resize', redrawOverlay); }, [redrawOverlay]);

  if (!online || !camera.enabled) {
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Camera size={28} color="#666" />
        <Typography variant="caption" color="text.disabled">OFFLINE</Typography>
      </Box>
    );
  }
  if (streamError) return <SnapshotFeed camera={camera} />;

  return (
    <>
      {loading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000', zIndex: 10 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      <img
        ref={imgRef} src={streamUrl} alt={camera.name}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
        onLoad={() => { setLoading(false); requestAnimationFrame(redrawOverlay); }}
        onError={() => { setLoading(false); setStreamError(true); }}
      />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
      {detectionFresh && latestDetection && (
        <Box sx={{
          position: 'absolute', bottom: 8, right: 8, px: 1.5, py: 1, borderRadius: 2,
          bgcolor: alpha(analysisMethod === 'opencv' ? '#052e16' : isKnown && isAuthorized ? '#052e16' : isKnown ? '#431a03' : '#450a0a', 0.9),
          border: '1px solid', borderColor: analysisMethod === 'opencv' ? '#22c55e' : isKnown && isAuthorized ? '#22c55e' : isKnown ? '#f59e0b' : '#ef4444',
          zIndex: 20, maxWidth: '80%',
        }}>
          <Typography variant="caption" fontWeight={700} noWrap display="block" sx={{ color: '#fff', fontSize: '0.7rem' }}>
            {analysisMethod === 'opencv' ? `FACE DETECTED${faceCount > 1 ? ` • ${faceCount}` : ''}` : isKnown ? (latestDetection.person_name || 'Known Person') : '⚠ UNKNOWN FACE'}
          </Typography>
          {analysisMethod !== 'opencv' && isKnown && (
            <Typography variant="caption" display="block" sx={{ fontSize: '0.6rem', color: '#ccc', opacity: 0.9 }}>
              {latestDetection.person_employee_id ? `ID: ${latestDetection.person_employee_id}` : ''}{latestDetection.person_role ? ` · ${latestDetection.person_role}` : ''}
            </Typography>
          )}
        </Box>
      )}
      {threatAlert && (
        <Box sx={{
          position: 'absolute', top: 8, left: 8, right: 8, px: 1.5, py: 1, borderRadius: 2, zIndex: 30,
          bgcolor: alpha(threatAlert.severity === 'CRITICAL' ? '#450a0a' : '#431a03', 0.92),
          border: `1px solid ${threatAlert.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b'}`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#fff', fontSize: '0.7rem' }}>
              <AlertTriangle size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {(threatAlert.threat_type || '').replace(/_/g, ' ')}{threatAlert.weapon_class ? ` · ${threatAlert.weapon_class.toUpperCase()}` : ''}
            </Typography>
            {threatAlert.confidence && <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#ccc' }}>{Math.round(threatAlert.confidence * 100)}%</Typography>}
          </Box>
        </Box>
      )}
    </>
  );
}

function SnapshotFeed({ camera }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading]   = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res  = await apiFetch(`/cameras/${camera.id}/test`);
        const data = await res.json();
        if (!cancelled && data.success && data.data?.snapshot) setSnapshot(data.data.snapshot);
      } catch (_) {}
      if (!cancelled) setLoading(false);
    };
    load();
    const iv = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [camera.id]);
  return (
    <>
      {loading && !snapshot && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000', zIndex: 10 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {snapshot
        ? <img src={snapshot} alt={camera.name} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        : !loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <Camera size={28} color="#666" />
          </Box>
        )
      }
    </>
  );
}

function CameraCard({ camera, onEdit, onDelete }) {
  const theme  = useTheme();
  const online = camera.online !== false;
  const [detectionMeta, setDetectionMeta] = useState({ latestDetection: null, detectionCount: 0, detectionAge: null, overlayBoxes: [], analysisMethod: 'opencv', faceCount: 0 });

  const isKnown       = Boolean(detectionMeta.latestDetection?.person_id);
  const isAuthorized  = detectionMeta.latestDetection?.person_authorized === 1;
  const detectionFresh = Boolean(detectionMeta.detectionAge) && detectionMeta.detectionAge <= 120_000;
  const faceCount     = detectionMeta.latestDetection?.face_count || detectionMeta.overlayBoxes.length || detectionMeta.faceCount || 0;
  const hasFaceBoxes  = detectionFresh && detectionMeta.overlayBoxes.length > 0;
  const hasRecentDetection = detectionFresh && detectionMeta.latestDetection;

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid', borderColor: online ? 'divider' : 'error.light' }}>
      {/* Video area */}
      <Box sx={{ position: 'relative', height: 192, bgcolor: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LiveFeed camera={camera} onDetectionMetadata={setDetectionMeta} />
        {/* LIVE badge */}
        <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 10, bgcolor: alpha(online ? '#052e16' : '#450a0a', 0.88), border: `1px solid ${online ? '#22c55e88' : '#ef444488'}` }}>
          {online ? <Wifi size={9} color="#22c55e" /> : <WifiOff size={9} color="#ef4444" />}
          <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: online ? '#22c55e' : '#ef4444' }}>{online ? 'LIVE' : 'OFFLINE'}</Typography>
        </Box>
        {/* AI badge */}
        <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 20, display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 10, bgcolor: alpha(camera.face_recognition_enabled ? '#052e16' : '#1e293b', 0.88), border: `1px solid ${camera.face_recognition_enabled ? '#22c55e44' : '#33415544'}` }}>
          <ShieldCheck size={9} color={camera.face_recognition_enabled ? '#22c55e' : '#64748b'} />
          <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: camera.face_recognition_enabled ? '#22c55e' : '#64748b' }}>{camera.face_recognition_enabled ? 'LOCAL AI' : 'AI OFF'}</Typography>
        </Box>
        {/* Disabled overlay */}
        {!camera.enabled && (
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: alpha('#000', 0.6), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
            <EyeOff size={16} color="#aaa" style={{ marginRight: 6 }} />
            <Typography variant="caption" fontWeight={700} color="#aaa">DISABLED</Typography>
          </Box>
        )}
      </Box>

      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 2 } }}>
        <Typography variant="subtitle2" fontWeight={700} noWrap color={camera.enabled ? 'text.primary' : 'text.disabled'}>{camera.name}</Typography>
        {camera.location && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <MapPin size={10} color={theme.palette.text.disabled} />
            <Typography variant="caption" color="text.secondary" noWrap>{camera.location}</Typography>
          </Box>
        )}

        {/* Face recognition info */}
        {camera.face_recognition_enabled && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.06), border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.18) }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" fontWeight={600}>{hasFaceBoxes ? `${faceCount || 1} face(s) detected` : 'Watching for faces'}</Typography>
              <Chip label={hasFaceBoxes ? 'ACTIVE' : 'SCANNING'} color={hasFaceBoxes ? 'success' : 'primary'} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }} />
            </Box>
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Events</Typography>
                <Typography variant="body2" fontWeight={700}>{detectionMeta.detectionCount}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Last scan</Typography>
                <Typography variant="body2" fontWeight={700} color={hasRecentDetection ? 'success.main' : 'text.disabled'}>
                  {hasRecentDetection ? `${Math.round(detectionMeta.detectionAge / 1000)}s ago` : '—'}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Device tag */}
        {camera.device_id && (
          <Box sx={{ mt: 'auto', pt: 1 }}>
            <Typography variant="caption" color="text.secondary">Device: <strong>{camera.device_id}</strong></Typography>
          </Box>
        )}

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button fullWidth size="small" variant="outlined" startIcon={<Edit2 size={12} />} onClick={() => onEdit(camera)}>Edit</Button>
          <IconButton size="small" color="error" onClick={() => onDelete(camera)} sx={{ border: '1px solid', borderColor: 'error.light', borderRadius: 1 }}>
            <Trash2 size={14} />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function Cameras() {
  const [cameras, setCameras]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [viewMode, setViewMode]       = useState('grid');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);

  const loadCameras = async () => {
    try {
      const res  = await apiFetch('/cameras');
      const data = await res.json();
      if (data.success) setCameras(data.data || []);
    } catch (err) { console.error('Failed to load cameras:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadCameras(); const t = setInterval(loadCameras, 30000); return () => clearInterval(t); }, []);

  const handleAdd    = () => { setEditingCamera(null); setModalOpen(true); };
  const handleEdit   = (camera) => { setEditingCamera(camera); setModalOpen(true); };
  const handleDelete = async (camera) => {
    if (!window.confirm(`Delete camera "${camera.name}"?`)) return;
    try {
      const res  = await apiFetch(`/cameras/${camera.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { await loadCameras(); }
      else alert(`Failed to delete camera: ${data.error || 'Unknown error'}`);
    } catch (err) { console.error('Delete camera error:', err); alert('Failed to delete camera'); }
  };
  const handleSave = async () => { setModalOpen(false); await loadCameras(); };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
        <CircularProgress /><Typography color="text.secondary">Loading cameras…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Camera size={22} style={{ flexShrink: 0 }} /> Cameras
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.25}>{cameras.length} camera{cameras.length !== 1 ? 's' : ''} configured</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ToggleButtonGroup size="small" value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)}>
            <ToggleButton value="grid"><LayoutGrid size={16} /></ToggleButton>
            <ToggleButton value="list"><List size={16} /></ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" startIcon={<Plus size={15} />} onClick={handleAdd}>Add Camera</Button>
        </Box>
      </Box>

      {cameras.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12, gap: 2 }}>
          <Camera size={48} color="#ccc" />
          <Typography variant="h6" color="text.secondary">No cameras configured</Typography>
          <Typography variant="body2" color="text.disabled">Add your first camera to start monitoring</Typography>
          <Button variant="contained" startIcon={<Plus size={15} />} onClick={handleAdd} sx={{ mt: 1 }}>Add Camera</Button>
        </Box>
      ) : viewMode === 'grid' ? (
        <Grid container spacing={2}>
          {cameras.map(camera => (
            <Grid item xs={12} sm={6} lg={4} key={camera.id}>
              <CameraCard camera={camera} onEdit={handleEdit} onDelete={handleDelete} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell>Name</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Device</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cameras.map(camera => {
                const online = camera.online !== false;
                return (
                  <TableRow key={camera.id} hover>
                    <TableCell><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: online ? 'success.main' : 'error.main' }} /></TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} color={camera.enabled ? 'text.primary' : 'text.disabled'}>{camera.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{camera.type || 'RTSP'}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{camera.location || '—'}</Typography></TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{camera.device_id || '—'}</Typography></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.75 }}>
                        {camera.face_recognition_enabled && <Chip label="AI" color="success" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
                        {!camera.enabled && <Chip label="DISABLED" color="default" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleEdit(camera)}><Edit2 size={14} /></IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(camera)}><Trash2 size={14} /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {modalOpen && <CameraModal camera={editingCamera} onClose={() => setModalOpen(false)} onSave={handleSave} />}
    </Box>
  );
}


