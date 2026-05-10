import React, { useState, useEffect, useRef } from 'react';
import {
  FiCamera, FiPlus, FiEdit2, FiTrash2, FiEye, FiEyeOff,
  FiWifi, FiWifiOff, FiMapPin, FiRefreshCw, FiGrid, FiList,
} from 'react-icons/fi';
import { BsShieldCheck } from 'react-icons/bs';
import { apiFetch } from '../apiBase';
import { cn } from '../lib/utils';
import CameraModal from './CameraModal';

function LiveFeed({ camera, onDetectionMetadata }) {
  const online = camera.online !== false;
  const [streamError, setStreamError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [latestDetection, setLatestDetection] = useState(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const imgRef = useRef(null);
  const streamUrl = `/api/cameras/${camera.id}/mjpeg?fps=5&t=${Date.now()}`;

  // Reset error state when camera changes
  useEffect(() => {
    setStreamError(false);
    setLoading(true);
  }, [camera.id]);

  useEffect(() => {
    let cancelled = false;

    const loadLatestDetection = async () => {
      try {
        const res = await apiFetch(`/face-detections?camera_id=${camera.id}&hours=1&limit=100`);
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.data)) {
          if (data.data.length > 0) {
            setLatestDetection(data.data[0]);
          } else {
            setLatestDetection(null);
          }
          setDetectionCount(data.data.length);
          if (onDetectionMetadata) {
            onDetectionMetadata({
              latestDetection: data.data[0] || null,
              detectionCount: data.data.length,
              detectionAge: data.data[0]?.timestamp ? Math.abs(Date.now() - new Date(`${data.data[0].timestamp} UTC`).getTime()) : null
            });
          }
        } else if (!cancelled) {
          setLatestDetection(null);
          setDetectionCount(0);
          if (onDetectionMetadata) onDetectionMetadata({ latestDetection: null, detectionCount: 0, detectionAge: null });
        }
      } catch (_) {
        if (!cancelled) {
          setLatestDetection(null);
          setDetectionCount(0);
          if (onDetectionMetadata) onDetectionMetadata({ latestDetection: null, detectionCount: 0, detectionAge: null });
        }
      }
    };

    loadLatestDetection();
    const iv = setInterval(loadLatestDetection, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [camera.id, onDetectionMetadata]);

  const detectionAgeMs = latestDetection?.timestamp
    ? Math.abs(Date.now() - new Date(`${latestDetection.timestamp} UTC`).getTime())
    : Number.MAX_SAFE_INTEGER;
  const detectionFresh = detectionAgeMs <= 30000;  // 30s threshold for better visibility
  const isKnown = Boolean(latestDetection?.person_id);
  const isAuthorized = latestDetection?.person_authorized === 1;

  if (!online || !camera.enabled) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2">
        <FiCamera className="text-3xl" />
        <span className="text-xs">OFFLINE</span>
      </div>
    );
  }

  if (streamError) {
    // Fallback: snapshot every 3s
    return <SnapshotFeed camera={camera} />;
  }

  return (
    <>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-900 z-10">
          <FiRefreshCw className="text-2xl text-slate-500 animate-spin" />
        </div>
      )}
      <img
        ref={imgRef}
        src={streamUrl}
        alt={camera.name}
        className="w-full h-full object-cover"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setStreamError(true); }}
      />

      {detectionFresh && latestDetection && (
        <div
          className={cn(
            'absolute bottom-2 right-2 px-3 py-2 rounded-lg border shadow-lg backdrop-blur-sm z-20 max-w-[80%]',
            isKnown && isAuthorized
              ? 'bg-emerald-900/80 border-emerald-500/60 text-emerald-200'
              : isKnown
              ? 'bg-amber-900/80 border-amber-500/60 text-amber-200'
              : 'bg-red-900/80 border-red-500/60 text-red-200'
          )}
        >
          <p className="text-xs font-bold truncate">
            {isKnown ? (latestDetection.person_name || 'Known Person') : 'Unknown Face'}
          </p>
          <p className="text-[10px] opacity-90 truncate">
            {isKnown
              ? `${latestDetection.person_employee_id || 'N/A'} • ${isAuthorized ? 'AUTHORIZED' : 'UNAUTHORIZED'}`
              : 'NO MATCH'}
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
          <FiRefreshCw className="text-2xl text-slate-500 animate-spin" />
        </div>
      )}
      {snapshot
        ? <img src={snapshot} alt={camera.name} className="w-full h-full object-cover" />
        : !loading && (
          <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-slate-600">
            <FiCamera className="text-3xl" />
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
    detectionAge: null
  });

  const isKnown = Boolean(detectionMeta.latestDetection?.person_id);
  const isAuthorized = detectionMeta.latestDetection?.person_authorized === 1;
  const detectionFresh = detectionMeta.detectionAge && detectionMeta.detectionAge <= 30000;
  const hasRecentDetection = detectionFresh && detectionMeta.latestDetection;

  return (
    <div className={cn(
      'bg-surface-800 rounded-xl border transition-all overflow-hidden flex flex-col',
      online ? 'border-surface-600 hover:border-primary-700' : 'border-red-900/50'
    )}>
      {/* Live video feed */}
      <div className="relative h-48 bg-surface-900 flex items-center justify-center overflow-hidden">
        <LiveFeed camera={camera} onDetectionMetadata={setDetectionMeta} />
        
        {/* Status indicator - top left */}
        <div className={cn(
          'absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold border z-20',
          online 
            ? 'bg-emerald-900/80 text-emerald-300 border-emerald-500/50' 
            : 'bg-red-900/80 text-red-300 border-red-500/50'
        )}>
          {online ? <FiWifi className="text-[10px]" /> : <FiWifiOff className="text-[10px]" />}
          {online ? 'LIVE' : 'OFFLINE'}
        </div>

        {/* FR Status Badge - top right */}
        <div className={cn(
          'absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border z-20 transition-all',
          camera.face_recognition_enabled
            ? hasRecentDetection && isKnown && isAuthorized
              ? 'bg-emerald-900/80 text-emerald-300 border-emerald-500/50'
              : hasRecentDetection && isKnown
              ? 'bg-amber-900/80 text-amber-300 border-amber-500/50'
              : hasRecentDetection
              ? 'bg-red-900/80 text-red-300 border-red-500/50'
              : 'bg-blue-900/80 text-blue-300 border-blue-500/50'
            : 'bg-slate-900/80 text-slate-400 border-slate-600/50'
        )}>
          <BsShieldCheck className="text-[10px]" />
          {camera.face_recognition_enabled ? 'FR ON' : 'FR OFF'}
        </div>

        {/* Disabled overlay */}
        {!camera.enabled && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
            <div className="flex items-center gap-2 text-slate-400">
              <FiEyeOff />
              <span className="text-sm font-bold">DISABLED</span>
            </div>
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="p-4 flex flex-col flex-1">
        {/* Title & Location */}
        <div className="mb-3">
          <h3 className={cn(
            'font-semibold text-sm truncate',
            camera.enabled ? 'text-white' : 'text-slate-500'
          )}>
            {camera.name}
          </h3>
          {camera.location && (
            <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1 truncate">
              <FiMapPin className="shrink-0 text-[10px]" />
              {camera.location}
            </p>
          )}
        </div>

        {/* Detection Statistics - New */}
        {camera.face_recognition_enabled && (
          <div className="mb-3 p-2.5 bg-surface-700/50 rounded-lg border border-surface-600">
            <div className="grid grid-cols-2 gap-2">
              {/* Detection Count */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Detections</p>
                <p className="text-sm font-bold text-white">{detectionMeta.detectionCount}</p>
              </div>
              {/* Last Detection */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Last Detection</p>
                {hasRecentDetection ? (
                  <p className="text-sm font-bold text-emerald-300">
                    {Math.round(detectionMeta.detectionAge / 1000)}s ago
                  </p>
                ) : (
                  <p className="text-sm font-bold text-slate-400">—</p>
                )}
              </div>
            </div>

            {/* Person Info - if recent detection */}
            {hasRecentDetection && detectionMeta.latestDetection && (
              <div className="mt-2 pt-2 border-t border-surface-600">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Current Face</p>
                <p className="text-xs font-semibold text-white truncate">
                  {isKnown ? detectionMeta.latestDetection.person_name : '👤 Unknown'}
                </p>
                {isKnown && (
                  <p className={cn(
                    'text-[10px] font-medium mt-0.5',
                    isAuthorized ? 'text-emerald-400' : 'text-amber-400'
                  )}>
                    {isAuthorized ? '✓ AUTHORIZED' : '⚠ UNAUTHORIZED'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Device association */}
        {camera.device_id && (
          <div className="mt-auto pt-2 px-2 py-1 rounded bg-surface-900 border border-surface-600 text-xs text-slate-400">
            Device: <span className="text-slate-300 font-medium">{camera.device_id}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onEdit(camera)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white text-sm font-medium transition-colors border border-surface-600"
          >
            <FiEdit2 className="text-xs" />
            Edit
          </button>
          <button
            onClick={() => onDelete(camera)}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 text-sm font-medium transition-colors border border-red-700/30"
          >
            <FiTrash2 className="text-xs" />
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
          online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-500'
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
            <span className="px-2 py-1 rounded text-xs font-bold bg-blue-900/20 text-blue-300 border border-blue-700/30">
              FR
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
            <FiEdit2 className="text-sm" />
          </button>
          <button
            onClick={() => onDelete(camera)}
            className="p-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 transition-colors"
          >
            <FiTrash2 className="text-sm" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
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
    // Refresh every 30 seconds
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
        <FiRefreshCw className="animate-spin text-5xl text-blue-500" />
        <p className="text-lg">Loading cameras...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FiCamera className="text-primary-400" />
            Cameras
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        
        <div className="flex gap-2">
          {/* View toggle */}
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
              <FiGrid />
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
              <FiList />
            </button>
          </div>

          {/* Add button */}
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            <FiPlus />
            Add Camera
          </button>
        </div>
      </div>

      {/* Empty state */}
      {cameras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <FiCamera className="text-6xl mb-4 text-slate-700" />
          <p className="text-lg font-medium mb-2">No cameras configured</p>
          <p className="text-sm mb-6">Add your first camera to start monitoring</p>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            <FiPlus />
            Add Camera
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid view */
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
        /* List view */
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

      {/* Camera Modal */}
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
