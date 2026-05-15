import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, Plus, Edit2, Trash2, EyeOff,
  Wifi, WifiOff, MapPin, RefreshCw, LayoutGrid, List, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../apiBase';
import { cn } from '../lib/utils';
import CameraModal from './CameraModal';
import getSocket from '../socketClient';

function parseBBoxList(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list
      .filter(Boolean)
      .map((box) => {
        const left   = Number(box.left ?? box.x ?? 0);
        const top    = Number(box.top ?? box.y ?? 0);
        const right  = Number(
          box.right ?? (box.x != null && box.width != null
            ? Number(box.x) + Number(box.width)
            : 0)
        );
        const bottom = Number(
          box.bottom ?? (box.y != null && box.height != null
            ? Number(box.y) + Number(box.height)
            : 0)
        );
        return { left, top, right, bottom };
      })
      .filter((box) => [box.left, box.top, box.right, box.bottom].every(Number.isFinite));
  } catch (_) {
    return [];
  }
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
  const [streamError, setStreamError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [latestDetection, setLatestDetection] = useState(null);
  const [overlayBoxes, setOverlayBoxes] = useState([]);
  const [objectBoxes, setObjectBoxes] = useState([]);
  const [threatAlert, setThreatAlert] = useState(null);
  const threatTimerRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const streamNonceRef = useRef(Date.now());
  const streamUrl = `/api/cameras/${camera.id}/mjpeg?fps=5&t=${streamNonceRef.current}`;

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
          onDetectionMetadata({
            latestDetection: data,
            detectionCount: 1,
            detectionAge: 0,
            overlayBoxes: boxes,
            analysisMethod: data.method || 'dlib',
            faceCount: data.face_count || boxes.length,
          });
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

      return () => {
        sock.off('face_detected',   onFace);
        sock.off('threat_detected', onThreat);
        sock.off('weapon_detected', onThreat);
      };
    });
    return () => { cancelled = true; clearTimeout(threatTimerRef.current); };
  }, [camera.id, onDetectionMetadata]);

  useEffect(() => {
    setStreamError(false);
    setLoading(true);
    streamNonceRef.current = Date.now();
  }, [camera.id]);

  useEffect(() => {
    let cancelled = false;

    const loadLatestDetection = async () => {
      try {
        const res = await apiFetch(`/face-detections?camera_id=${camera.id}&hours=1&limit=100`);
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.data)) {
          const latest = data.data[0] || null;
          const boxes = parseBBoxList(latest?.bbox_json);
          setLatestDetection(data.data.length > 0 ? latest : null);
          setOverlayBoxes(boxes);
          if (onDetectionMetadata) {
            onDetectionMetadata({
              latestDetection: latest,
              detectionCount: data.data.length,
              detectionAge: latest?.timestamp ? Math.abs(Date.now() - parseDbTimestamp(latest.timestamp)) : null,
              overlayBoxes: boxes,
              analysisMethod: latest?.analysis_method || 'opencv',
              faceCount: latest?.face_count || boxes.length,
            });
          }
        } else if (!cancelled) {
          setLatestDetection(null);
          setOverlayBoxes([]);
          if (onDetectionMetadata) {
            onDetectionMetadata({
              latestDetection: null,
              detectionCount: 0,
              detectionAge: null,
              overlayBoxes: [],
              analysisMethod: 'opencv',
              faceCount: 0,
            });
          }
        }
      } catch (_) {
        if (!cancelled) {
          setLatestDetection(null);
          setOverlayBoxes([]);
          if (onDetectionMetadata) {
            onDetectionMetadata({
              latestDetection: null,
              detectionCount: 0,
              detectionAge: null,
              overlayBoxes: [],
              analysisMethod: 'opencv',
              faceCount: 0,
            });
          }
        }
      }
    };

    loadLatestDetection();
    const iv = setInterval(loadLatestDetection, 2000);

    let objCancelled = false;
    const loadObjects = async () => {
      try {
        const res = await apiFetch(`/cameras/${camera.id}/object-detections?hours=0.1`);
        const data = await res.json();
        if (!objCancelled && data.success && Array.isArray(data.data)) {
          setObjectBoxes(data.data.map(d => ({
            ...parseBBoxList(d.bbox_json)[0],
            class_name: d.class_name,
            confidence: d.confidence,
            timestamp: d.timestamp,
          })).filter(b => b && b.left != null));
        }
      } catch (_) {}
    };
    loadObjects();
    const objIv = setInterval(loadObjects, 2000);

    return () => {
      cancelled = true;
      clearInterval(iv);
      objCancelled = true;
      clearInterval(objIv);
    };
  }, [camera.id, onDetectionMetadata]);

  const detectionAgeMs = latestDetection?.timestamp
    ? Math.abs(Date.now() - parseDbTimestamp(latestDetection.timestamp))
    : Number.MAX_SAFE_INTEGER;
  const detectionFresh = detectionAgeMs <= 15_000;
  const faceCount = latestDetection?.face_count || overlayBoxes.length;
  const isKnown = Boolean(latestDetection?.person_id);
  const isAuthorized = latestDetection?.person_authorized === 1;
  const analysisMethod = latestDetection?.analysis_method || 'opencv';

  const redrawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete || !img.naturalWidth || !img.naturalHeight) return;

    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const sourceWidth = latestDetection?.frame_width || img.naturalWidth;
    const sourceHeight = latestDetection?.frame_height || img.naturalHeight;
    const sourceAspect = sourceWidth / sourceHeight;
    const containerAspect = rect.width / rect.height;
    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (containerAspect > sourceAspect) {
      renderHeight = rect.height;
      renderWidth = renderHeight * sourceAspect;
      offsetX = (rect.width - renderWidth) / 2;
    } else {
      renderWidth = rect.width;
      renderHeight = renderWidth / sourceAspect;
      offsetY = (rect.height - renderHeight) / 2;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const toCanvas = (box) => ({
      x: offsetX + Math.max(0, Math.min(1, box.left)) * renderWidth,
      y: offsetY + Math.max(0, Math.min(1, box.top)) * renderHeight,
      w: Math.max(0, Math.min(1, box.right - box.left)) * renderWidth,
      h: Math.max(0, Math.min(1, box.bottom - box.top)) * renderHeight,
    });

    if (detectionFresh && overlayBoxes.length > 0) {
      const isFR = analysisMethod === 'face_recognition';
      overlayBoxes.forEach((box, index) => {
        const { x, y, w, h } = toCanvas(box);

        let strokeColor, shadowColor, labelBg, labelText;
        if (!isFR) {
          strokeColor = '#22c55e'; shadowColor = 'rgba(34,197,94,0.85)';
          labelBg = 'rgba(5,46,22,0.88)'; labelText = '#bbf7d0';
        } else if (!isKnown) {
          strokeColor = '#ef4444'; shadowColor = 'rgba(239,68,68,0.85)';
          labelBg = 'rgba(69,10,10,0.9)'; labelText = '#fecaca';
        } else if (isAuthorized) {
          strokeColor = '#22c55e'; shadowColor = 'rgba(34,197,94,0.85)';
          labelBg = 'rgba(5,46,22,0.88)'; labelText = '#bbf7d0';
        } else {
          strokeColor = '#f59e0b'; shadowColor = 'rgba(245,158,11,0.85)';
          labelBg = 'rgba(69,26,3,0.9)'; labelText = '#fde68a';
        }

        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 10;
        ctx.strokeRect(x, y, w, h);
        ctx.shadowBlur = 0;

        let topLabel, subLabel;
        if (!isFR) {
          topLabel = `FACE ${index + 1}`;
          subLabel = null;
        } else if (!isKnown) {
          topLabel = 'UNKNOWN';
          subLabel = 'No match in DB';
        } else {
          topLabel = latestDetection?.person_name || 'Known';
          const pct = latestDetection?.confidence != null
            ? ` ${Math.round(latestDetection.confidence * 100)}%` : '';
          subLabel = `${isAuthorized ? '✓ AUTH' : '✗ UNAUTH'}${pct}`;
        }

        ctx.font = '700 12px Inter, system-ui, sans-serif';
        const textW = Math.max(
          ctx.measureText(topLabel).width,
          subLabel ? ctx.measureText(subLabel).width : 0
        );
        const labelH = subLabel ? 34 : 20;
        const labelW = textW + 18;
        const labelX = x;
        const labelY = Math.max(4, y - labelH - 2);

        ctx.fillStyle = labelBg;
        ctx.fillRect(labelX, labelY, labelW, labelH);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX, labelY, labelW, labelH);

        ctx.fillStyle = labelText;
        ctx.font = '700 12px Inter, system-ui, sans-serif';
        ctx.fillText(topLabel, labelX + 8, labelY + 14);
        if (subLabel) {
          ctx.font = '500 10px Inter, system-ui, sans-serif';
          ctx.fillStyle = labelText;
          ctx.globalAlpha = 0.85;
          ctx.fillText(subLabel, labelX + 8, labelY + 28);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      });
    }

    const OBJ_AGE_LIMIT = 15000;
    const freshObjects = objectBoxes.filter(ob => {
      const age = Math.abs(Date.now() - (parseDbTimestamp(ob.timestamp) || 0));
      return age <= OBJ_AGE_LIMIT && ob.left != null;
    });

    const OBJ_COLORS = {
      'cell phone': { stroke: '#f97316', shadow: 'rgba(249,115,22,0.85)', bg: 'rgba(67,20,7,0.9)', text: '#fed7aa' },
      'knife':      { stroke: '#ef4444', shadow: 'rgba(239,68,68,0.85)',  bg: 'rgba(69,10,10,0.9)', text: '#fecaca' },
      'scissors':   { stroke: '#ef4444', shadow: 'rgba(239,68,68,0.85)',  bg: 'rgba(69,10,10,0.9)', text: '#fecaca' },
      'backpack':   { stroke: '#3b82f6', shadow: 'rgba(59,130,246,0.85)', bg: 'rgba(7,25,65,0.9)',  text: '#bfdbfe' },
      'handbag':    { stroke: '#3b82f6', shadow: 'rgba(59,130,246,0.85)', bg: 'rgba(7,25,65,0.9)',  text: '#bfdbfe' },
      'gun':        { stroke: '#ef4444', shadow: 'rgba(239,68,68,0.85)',  bg: 'rgba(69,10,10,0.9)', text: '#fecaca' },
      'default':    { stroke: '#a855f7', shadow: 'rgba(168,85,247,0.85)', bg: 'rgba(46,16,101,0.9)', text: '#e9d5ff' },
    };

    freshObjects.forEach(ob => {
      if (ob.left == null || ob.right == null) return;
      const { x, y, w, h } = toCanvas(ob);
      const col = OBJ_COLORS[ob.class_name] || OBJ_COLORS['default'];
      const pct = ob.confidence != null ? ` ${Math.round(ob.confidence * 100)}%` : '';
      const label = `${(ob.class_name || 'object').toUpperCase()}${pct}`;

      ctx.save();
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.shadowColor = col.shadow;
      ctx.shadowBlur = 8;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      ctx.font = '700 11px Inter, system-ui, sans-serif';
      const lw = ctx.measureText(label).width + 14;
      const lx = x;
      const ly = Math.min(y + h + 2, rect.height - 22);

      ctx.fillStyle = col.bg;
      ctx.fillRect(lx, ly, lw, 20);
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx, ly, lw, 20);
      ctx.fillStyle = col.text;
      ctx.fillText(label, lx + 7, ly + 14);
      ctx.restore();
    });
  }, [detectionFresh, overlayBoxes, objectBoxes, latestDetection, analysisMethod, isKnown, isAuthorized]);

  useEffect(() => {
    redrawOverlay();
    window.addEventListener('resize', redrawOverlay);
    return () => window.removeEventListener('resize', redrawOverlay);
  }, [redrawOverlay]);

  if (!online || !camera.enabled) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2">
        <Camera size={28} className="text-slate-600" />
        <span className="text-xs">OFFLINE</span>
      </div>
    );
  }

  if (streamError) {
    return <SnapshotFeed camera={camera} />;
  }

  return (
    <>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-900 z-10">
          <RefreshCw size={20} className="text-slate-500 animate-spin" />
        </div>
      )}
      <img
        ref={imgRef}
        src={streamUrl}
        alt={camera.name}
        className="w-full h-full object-contain bg-black"
        onLoad={() => {
          setLoading(false);
          requestAnimationFrame(redrawOverlay);
        }}
        onError={() => { setLoading(false); setStreamError(true); }}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 pointer-events-none"
      />

      {detectionFresh && latestDetection && (
        <div
          className={cn(
            'absolute bottom-2 right-2 px-3 py-2 rounded-lg border shadow-lg backdrop-blur-sm z-20 max-w-[80%]',
            analysisMethod === 'opencv'
              ? 'bg-emerald-900/85 border-emerald-500/60 text-emerald-100'
              : isKnown && isAuthorized
              ? 'bg-emerald-900/80 border-emerald-500/60 text-emerald-200'
              : isKnown
              ? 'bg-amber-900/80 border-amber-500/60 text-amber-200'
              : 'bg-red-900/80 border-red-500/60 text-red-200'
          )}
        >
          <p className="text-xs font-bold truncate leading-tight">
            {analysisMethod === 'opencv'
              ? `FACE DETECTED${faceCount > 1 ? ` • ${faceCount}` : ''}`
              : isKnown ? (latestDetection.person_name || 'Known Person') : '⚠ UNKNOWN FACE'}
          </p>
          {analysisMethod !== 'opencv' && isKnown && (
            <p className="text-[10px] opacity-90 truncate">
              {latestDetection.person_employee_id ? `ID: ${latestDetection.person_employee_id}` : ''}
              {latestDetection.person_role ? ` · ${latestDetection.person_role}` : ''}
            </p>
          )}
          <p className="text-[10px] opacity-75 truncate">
            {analysisMethod === 'opencv'
              ? 'OpenCV · Local'
              : isKnown
                ? `${isAuthorized ? '✓ AUTHORIZED' : '✗ UNAUTHORIZED'}${latestDetection.confidence != null ? ` · ${Math.round(latestDetection.confidence * 100)}%` : ''}`
                : 'No match in database'}
          </p>
        </div>
      )}

      {}
      {threatAlert && (
        <div className={cn(
          'absolute top-2 left-2 right-2 px-3 py-2 rounded-lg border shadow-xl backdrop-blur-sm z-30',
          threatAlert.severity === 'CRITICAL'
            ? 'bg-red-900/90 border-red-500/80 text-red-100'
            : threatAlert.severity === 'HIGH'
            ? 'bg-orange-900/90 border-orange-500/70 text-orange-100'
            : 'bg-yellow-900/90 border-yellow-500/60 text-yellow-100',
        )}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold truncate animate-pulse">
              <AlertTriangle size={12} className="inline shrink-0" /> {(threatAlert.threat_type || '').replace(/_/g, ' ')}
              {threatAlert.weapon_class ? ` · ${threatAlert.weapon_class.toUpperCase()}` : ''}
            </p>
            <span className="text-[10px] shrink-0 opacity-80">
              {threatAlert.confidence ? `${Math.round(threatAlert.confidence * 100)}%` : ''}
            </span>
          </div>
          <p className="text-[10px] opacity-75">
            {threatAlert.severity} · {threatAlert.source === 'weapon' ? 'Weapon detected' : 'Behaviour analysis'}
          </p>
        </div>
      )}
    </>
  );
}

function SnapshotFeed({ camera }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`/cameras/${camera.id}/test`);
        const data = await res.json();
        if (!cancelled && data.success && data.data?.snapshot) {
          setSnapshot(data.data.snapshot);
        }
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
        <div className="absolute inset-0 flex items-center justify-center bg-surface-900 z-10">
          <RefreshCw size={20} className="text-slate-500 animate-spin" />
        </div>
      )}
      {snapshot
        ? <img src={snapshot} alt={camera.name} className="w-full h-full object-contain bg-black" />
        : !loading && (
          <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-slate-600">
            <Camera size={28} className="text-slate-600" />
          </div>
        )
      }
    </>
  );
}

function CameraCard({ camera, onEdit, onDelete }) {
  const online = camera.online !== false;
  const [detectionMeta, setDetectionMeta] = useState({
    latestDetection: null,
    detectionCount: 0,
    detectionAge: null,
    overlayBoxes: [],
    analysisMethod: 'opencv',
    faceCount: 0,
  });

  const isKnown = Boolean(detectionMeta.latestDetection?.person_id);
  const isAuthorized = detectionMeta.latestDetection?.person_authorized === 1;
  const detectionFresh = Boolean(detectionMeta.detectionAge)
    && detectionMeta.detectionAge <= 120_000;
  const faceCount = detectionMeta.latestDetection?.face_count
    || detectionMeta.overlayBoxes.length
    || detectionMeta.faceCount
    || 0;
  const hasFaceBoxes = detectionFresh && detectionMeta.overlayBoxes.length > 0;
  const localAnalysisOn = camera.face_recognition_enabled;
  const hasRecentDetection = detectionFresh && detectionMeta.latestDetection;

  return (
    <div className={cn(
      'bg-surface-800 rounded-xl border transition-all overflow-hidden flex flex-col',
      online ? 'border-surface-600 hover:border-primary-700' : 'border-red-900/50'
    )}>
      {}
      <div className="relative h-48 bg-surface-900 flex items-center justify-center overflow-hidden">
        <LiveFeed camera={camera} onDetectionMetadata={setDetectionMeta} />
        
        {}
        <div className={cn(
          'absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold border z-20',
          online 
            ? 'bg-emerald-900/80 text-emerald-300 border-emerald-500/50' 
            : 'bg-accent-900/80 text-accent-300 border-accent-500/50'
        )}>
          {online ? <Wifi size={9} /> : <WifiOff size={9} />}
          {online ? 'LIVE' : 'OFFLINE'}
        </div>

        {}
        <div className={cn(
          'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border z-20 transition-all',
          localAnalysisOn
            ? hasFaceBoxes
              ? 'bg-emerald-900/85 text-emerald-200 border-emerald-500/60'
              : 'bg-primary-900/80 text-primary-300 border-primary-500/50'
            : 'bg-slate-900/80 text-slate-400 border-slate-600/50'
        )}>
          <ShieldCheck size={9} />
          {localAnalysisOn ? 'LOCAL AI' : 'AI OFF'}
        </div>

        {}
        {!camera.enabled && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
            <div className="flex items-center gap-2 text-slate-400">
              <EyeOff size={16} />
              <span className="text-sm font-bold">DISABLED</span>
            </div>
          </div>
        )}
      </div>

      {}
      <div className="p-4 flex flex-col flex-1">
        {}
        <div className="mb-3">
          <h3 className={cn(
            'font-semibold text-sm truncate',
            camera.enabled ? 'text-white' : 'text-slate-500'
          )}>
            {camera.name}
          </h3>
          {camera.location && (
            <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1 truncate">
              <MapPin size={9} className="shrink-0" />
              {camera.location}
            </p>
          )}
        </div>

        {}
        {camera.face_recognition_enabled && (
          <div className="mb-3 p-3 bg-emerald-950/20 rounded-xl border border-emerald-500/15">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">Local analysis</p>
                <p className="text-sm font-semibold text-white">
                  {hasFaceBoxes ? `${faceCount || detectionMeta.overlayBoxes.length || 1} face(s) detected` : 'Watching for faces'}
                </p>
              </div>
              <span className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-bold border',
                hasFaceBoxes
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
              )}>
                {hasFaceBoxes ? 'ACTIVE' : 'SCANNING'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Events</p>
                <p className="text-sm font-bold text-white">{detectionMeta.detectionCount}</p>
              </div>
              {}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Last scan</p>
                {hasRecentDetection ? (
                  <p className="text-sm font-bold text-emerald-300">
                    {Math.round(detectionMeta.detectionAge / 1000)}s ago
                  </p>
                ) : (
                  <p className="text-sm font-bold text-slate-400">—</p>
                )}
              </div>
            </div>

            {}
            {hasRecentDetection && detectionMeta.latestDetection && (
              <div className="mt-2 pt-2 border-t border-surface-600">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Current analysis</p>
                <p className="text-xs font-semibold text-white truncate">
                  {localAnalysisOn ? 'Face detected in live view' : (isKnown ? detectionMeta.latestDetection.person_name : 'No face data')}
                </p>
                <p className="text-[10px] font-medium mt-0.5 text-emerald-300">
                  {localAnalysisOn ? 'OpenCV green-box overlay enabled' : (isAuthorized ? 'AUTHORIZED' : 'UNAUTHORIZED')}
                </p>
                {hasFaceBoxes && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {detectionMeta.overlayBoxes.length} box{detectionMeta.overlayBoxes.length !== 1 ? 'es' : ''} rendered on video
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {}
        {camera.device_id && (
          <div className="mt-auto pt-2 px-2 py-1 rounded bg-surface-900 border border-surface-600 text-xs text-slate-400">
            Device: <span className="text-slate-300 font-medium">{camera.device_id}</span>
          </div>
        )}

        {}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onEdit(camera)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white text-sm font-medium transition-colors border border-surface-600"
          >
            <Edit2 size={12} />
            Edit
          </button>
          <button
            onClick={() => onDelete(camera)}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent-900/20 hover:bg-accent-900/40 text-accent-400 hover:text-accent-300 text-sm font-medium transition-colors border border-accent-700/30"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CameraRow({ camera, onEdit, onDelete }) {
  const online = camera.online !== false;
  return (
    <tr className="border-b border-surface-700 hover:bg-surface-800/50 transition-colors">
      <td className="py-3 px-4">
        <div className={cn(
          'w-2 h-2 rounded-full',
          online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-accent-500'
        )} />
      </td>
      <td className="py-3 px-4">
        <div>
          <p className={cn('font-medium text-sm', camera.enabled ? 'text-white' : 'text-slate-500')}>
            {camera.name}
          </p>
          <p className="text-xs text-slate-600">{camera.type || 'RTSP'}</p>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-slate-400">
        {camera.location || '—'}
      </td>
      <td className="py-3 px-4 text-sm text-slate-400">
        {camera.device_id || '—'}
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-2">
          {camera.face_recognition_enabled && (
            <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-900/20 text-emerald-300 border border-emerald-700/30">
              AI
            </span>
          )}
          {!camera.enabled && (
            <span className="px-2 py-1 rounded text-xs font-bold bg-slate-900/20 text-slate-500 border border-slate-700/30">
              DISABLED
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => onEdit(camera)}
            className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => onDelete(camera)}
            className="p-2 rounded-lg bg-accent-900/20 hover:bg-accent-900/40 text-accent-400 hover:text-accent-300 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);

  const loadCameras = async () => {
    try {
      const res = await apiFetch('/cameras');
      const data = await res.json();
      if (data.success) {
        setCameras(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCameras();
    const interval = setInterval(loadCameras, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAdd = () => {
    setEditingCamera(null);
    setModalOpen(true);
  };

  const handleEdit = (camera) => {
    setEditingCamera(camera);
    setModalOpen(true);
  };

  const handleDelete = async (camera) => {
    if (!window.confirm(`Delete camera "${camera.name}"?`)) return;

    try {
      const res = await apiFetch(`/cameras/${camera.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadCameras();
      } else {
        alert(`Failed to delete camera: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Delete camera error:', err);
      alert('Failed to delete camera');
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    await loadCameras();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
        <RefreshCw size={40} className="animate-spin text-primary-400" />
        <p className="text-lg">Loading cameras...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Camera size={20} className="text-primary-400" />
            Cameras
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        
        <div className="flex gap-2">
          {}
          <div className="flex rounded-lg bg-surface-800 border border-surface-600 p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                viewMode === 'grid'
                  ? 'bg-primary-500/20 text-primary-300'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-primary-500/20 text-primary-300'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <List size={15} />
            </button>
          </div>

          {}
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            <Plus size={15} />
            Add Camera
          </button>
        </div>
      </div>

      {}
      {cameras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Camera size={48} className="mb-4 text-slate-700" />
          <p className="text-lg font-medium mb-2">No cameras configured</p>
          <p className="text-sm mb-6">Add your first camera to start monitoring</p>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            <Plus size={15} />
            Add Camera
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cameras.map(camera => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        
        <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-900 border-b border-surface-700">
              <tr className="text-left">
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-12">●</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Name</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Location</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Device</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map(camera => (
                <CameraRow
                  key={camera.id}
                  camera={camera}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {}
      {modalOpen && (
        <CameraModal
          camera={editingCamera}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
