import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../apiBase';
import { cn } from '../lib/utils';

export default function CameraModal({ camera, onClose, onSave }) {
  const isEdit = Boolean(camera);

  const [formData, setFormData] = useState({
    name: '',
    rtsp_url: '',
    type: 'RTSP',
    device_id: '',
    location: '',
    lat: '',
    lng: '',
    enabled: true,
    face_recognition_enabled: false,
    recording_enabled: true,
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (camera) {
      setFormData({
        name: camera.name || '',
        rtsp_url: camera.rtsp_url || '',
        type: camera.type || 'RTSP',
        device_id: camera.device_id || '',
        location: camera.location || '',
        lat: camera.lat || '',
        lng: camera.lng || '',
        enabled: camera.enabled !== false,
        face_recognition_enabled: camera.face_recognition_enabled || false,
        recording_enabled: camera.recording_enabled !== false,
      });
    }
  }, [camera]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
    if (field === 'rtsp_url' || field === 'type') {
      setTestResult(null);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Camera name is required';
    }

    if (!formData.rtsp_url.trim()) {
      newErrors.rtsp_url = 'RTSP URL or IP address is required';
    } else if (formData.type === 'RTSP' && !formData.rtsp_url.startsWith('rtsp://')) {
      newErrors.rtsp_url = 'RTSP URL must start with rtsp://';
    }

    if (formData.lat && isNaN(parseFloat(formData.lat))) {
      newErrors.lat = 'Invalid latitude';
    }

    if (formData.lng && isNaN(parseFloat(formData.lng))) {
      newErrors.lng = 'Invalid longitude';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTest = async () => {
    if (!formData.rtsp_url.trim()) {
      setErrors({ rtsp_url: 'Enter URL first' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      if (isEdit) {
        const res = await apiFetch(`/cameras/${camera.id}/test`);
        const data = await res.json();
        setTestResult({
          success: data.success,
          message: data.success ? 'Connection successful!' : (data.error || 'Connection failed'),
        });
      } else {
        setTestResult({
          success: true,
          message: 'URL format valid. Test connection after saving.',
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);

    try {
      const payload = {
        ...formData,
        lat: formData.lat ? parseFloat(formData.lat) : null,
        lng: formData.lng ? parseFloat(formData.lng) : null,
        device_id: formData.device_id || null,
      };

      const url = isEdit ? `/cameras/${camera.id}` : '/cameras';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        onSave();
      } else {
        alert(`Failed to save camera: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Save camera error:', err);
      alert('Failed to save camera');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-800 rounded-xl border border-surface-600 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {}
        <div className="flex items-center justify-between p-6 border-b border-surface-600">
          <h2 className="text-xl font-bold text-white">
            {isEdit ? 'Edit Camera' : 'Add New Camera'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-700 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Camera Name <span className="text-accent-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Main Entrance Camera"
              className={cn(
                'w-full px-4 py-2 rounded-lg bg-surface-900 border text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500',
                errors.name ? 'border-accent-500' : 'border-surface-600'
              )}
            />
            {errors.name && <p className="text-accent-400 text-xs mt-1">{errors.name}</p>}
          </div>

          {}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Camera Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="RTSP">RTSP Camera</option>
              <option value="ESP32-CAM">ESP32-CAM</option>
              <option value="USB">USB Camera</option>
            </select>
          </div>

          {}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {formData.type === 'RTSP' ? 'RTSP URL' : 'IP Address'} <span className="text-accent-400">*</span>
            </label>
            <input
              type="text"
              value={formData.rtsp_url}
              onChange={(e) => handleChange('rtsp_url', e.target.value)}
              placeholder={
                formData.type === 'RTSP'
                  ? 'rtsp://username:password@192.168.1.100:554/stream'
                  : '192.168.1.100'
              }
              className={cn(
                'w-full px-4 py-2 rounded-lg bg-surface-900 border text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500',
                errors.rtsp_url ? 'border-accent-500' : 'border-surface-600'
              )}
            />
            {errors.rtsp_url && <p className="text-accent-400 text-xs mt-1">{errors.rtsp_url}</p>}
            
            {}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !formData.rtsp_url.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:bg-surface-900 text-slate-300 disabled:text-slate-600 text-sm font-medium transition-colors"
              >
                {testing && <Loader2 size={14} className="animate-spin" />}
                Test Connection
              </button>

              {testResult && (
                <div className={cn(
                  'flex items-center gap-2 text-sm',
                  testResult.success ? 'text-emerald-400' : 'text-accent-400'
                )}>
                  {testResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {testResult.message}
                </div>
              )}
            </div>
          </div>

          {}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Associated Device (Optional)
            </label>
            <input
              type="text"
              value={formData.device_id}
              onChange={(e) => handleChange('device_id', e.target.value)}
              placeholder="e.g., ESP32_Zone_A"
              className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-slate-500 text-xs mt-1">Link camera to an ESP32 zone for correlation</p>
          </div>

          {}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Location Description
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="e.g., Building A - Main Entrance"
              className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Latitude
              </label>
              <input
                type="text"
                value={formData.lat}
                onChange={(e) => handleChange('lat', e.target.value)}
                placeholder="24.7136"
                className={cn(
                  'w-full px-4 py-2 rounded-lg bg-surface-900 border text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500',
                  errors.lat ? 'border-accent-500' : 'border-surface-600'
                )}
              />
              {errors.lat && <p className="text-accent-400 text-xs mt-1">{errors.lat}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Longitude
              </label>
              <input
                type="text"
                value={formData.lng}
                onChange={(e) => handleChange('lng', e.target.value)}
                placeholder="46.6753"
                className={cn(
                  'w-full px-4 py-2 rounded-lg bg-surface-900 border text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500',
                  errors.lng ? 'border-accent-500' : 'border-surface-600'
                )}
              />
              {errors.lng && <p className="text-accent-400 text-xs mt-1">{errors.lng}</p>}
            </div>
          </div>

          {}
          <div className="space-y-3 pt-4 border-t border-surface-600">
            <label className="flex items-center justify-between p-3 rounded-lg bg-surface-900 border border-surface-600 cursor-pointer hover:border-primary-700 transition-colors">
              <div>
                <p className="text-sm font-medium text-white">Enable Camera</p>
                <p className="text-xs text-slate-500">Activate monitoring for this camera</p>
              </div>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                className="w-5 h-5 rounded bg-surface-800 border-surface-600 text-primary-500 focus:ring-2 focus:ring-primary-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-surface-900 border border-surface-600 cursor-pointer hover:border-primary-700 transition-colors">
              <div>
                <p className="text-sm font-medium text-white">Local Face Analysis</p>
                <p className="text-xs text-slate-500">Enable OpenCV face detection with green-box overlays</p>
              </div>
              <input
                type="checkbox"
                checked={formData.face_recognition_enabled}
                onChange={(e) => handleChange('face_recognition_enabled', e.target.checked)}
                className="w-5 h-5 rounded bg-surface-800 border-surface-600 text-primary-500 focus:ring-2 focus:ring-primary-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-surface-900 border border-surface-600 cursor-pointer hover:border-primary-700 transition-colors">
              <div>
                <p className="text-sm font-medium text-white">Recording</p>
                <p className="text-xs text-slate-500">Enable video recording</p>
              </div>
              <input
                type="checkbox"
                checked={formData.recording_enabled}
                onChange={(e) => handleChange('recording_enabled', e.target.checked)}
                className="w-5 h-5 rounded bg-surface-800 border-surface-600 text-primary-500 focus:ring-2 focus:ring-primary-500"
              />
            </label>
          </div>
        </form>

        {}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-surface-600">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-primary-800 text-white font-medium transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Camera'}
          </button>
        </div>
      </div>
    </div>
  );
}
