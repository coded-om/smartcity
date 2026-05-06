import React, { useState, useEffect } from 'react';
import {
  FiCamera, FiPlus, FiEdit2, FiTrash2, FiEye, FiEyeOff,
  FiWifi, FiWifiOff, FiMapPin, FiRefreshCw, FiGrid, FiList,
} from 'react-icons/fi';
import { BsShieldCheck } from 'react-icons/bs';
import { apiFetch } from '../apiBase';
import { cn } from '../lib/utils';
import CameraModal from './CameraModal';

function CameraCard({ camera, onEdit, onDelete }) {
  const online = camera.online !== false; // default to online if not specified
  const [snapshot, setSnapshot] = useState(null);
  const [loadingSnap, setLoadingSnap] = useState(false);

  useEffect(() => {
    if (!camera.enabled || !online) return;

    const loadSnapshot = async () => {
      setLoadingSnap(true);
      try {
        // Try to get a test snapshot
        const res = await apiFetch(`/cameras/${camera.id}/test`);
        const data = await res.json();
        if (data.success && data.data?.snapshot) {
          setSnapshot(data.data.snapshot);
        }
      } catch (err) {
        console.error('Failed to load snapshot:', err);
      } finally {
        setLoadingSnap(false);
      }
    };

    loadSnapshot();
    // Refresh snapshot every 10 seconds
    const interval = setInterval(loadSnapshot, 10000);
    return () => clearInterval(interval);
  }, [camera.id, camera.enabled, online]);

  return (
    <div className={cn(
      'bg-surface-800 rounded-xl border transition-all overflow-hidden',
      online ? 'border-surface-600 hover:border-primary-700' : 'border-red-900/50'
    )}>
      {/* Snapshot preview */}
      <div className="relative h-40 bg-surface-900 flex items-center justify-center">
        {snapshot ? (
          <img src={snapshot} alt={camera.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-slate-600 flex flex-col items-center gap-2">
            <FiCamera className="text-3xl" />
            {loadingSnap && <FiRefreshCw className="text-sm animate-spin" />}
          </div>
        )}
        
        {/* Status indicator */}
        <div className={cn(
          'absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold border',
          online 
            ? 'bg-emerald-900/80 text-emerald-300 border-emerald-500/50' 
            : 'bg-red-900/80 text-red-300 border-red-500/50'
        )}>
          {online ? <FiWifi className="text-[10px]" /> : <FiWifiOff className="text-[10px]" />}
          {online ? 'LIVE' : 'OFFLINE'}
        </div>

        {/* Type badge */}
        <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold bg-surface-900/80 text-slate-300 border border-surface-600">
          {camera.type || 'RTSP'}
        </div>

        {/* FR badge */}
        {camera.face_recognition_enabled && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-blue-900/80 text-blue-300 border border-blue-500/50">
            <BsShieldCheck className="text-[10px]" />
            FR
          </div>
        )}

        {/* Disabled overlay */}
        {!camera.enabled && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400">
              <FiEyeOff />
              <span className="text-sm font-bold">DISABLED</span>
            </div>
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
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
        </div>

        {/* Device association */}
        {camera.device_id && (
          <div className="mt-2 px-2 py-1 rounded bg-surface-900 border border-surface-600 text-xs text-slate-400">
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
