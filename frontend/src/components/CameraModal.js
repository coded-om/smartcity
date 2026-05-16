import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../apiBase';

export default function CameraModal({ camera, onClose, onSave }) {
  const isEdit = Boolean(camera);

  const [formData, setFormData] = useState({
    name: '', rtsp_url: '', type: 'RTSP', device_id: '', location: '',
    lat: '', lng: '', enabled: true, face_recognition_enabled: false, recording_enabled: true,
  });
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [errors,     setErrors]     = useState({});

  useEffect(() => {
    if (camera) {
      setFormData({
        name: camera.name || '', rtsp_url: camera.rtsp_url || '', type: camera.type || 'RTSP',
        device_id: camera.device_id || '', location: camera.location || '',
        lat: camera.lat || '', lng: camera.lng || '',
        enabled: camera.enabled !== false,
        face_recognition_enabled: camera.face_recognition_enabled || false,
        recording_enabled: camera.recording_enabled !== false,
      });
    }
  }, [camera]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
    if (field === 'rtsp_url' || field === 'type') setTestResult(null);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Camera name is required';
    if (!formData.rtsp_url.trim()) newErrors.rtsp_url = 'RTSP URL or IP address is required';
    else if (formData.type === 'RTSP' && !formData.rtsp_url.startsWith('rtsp://')) newErrors.rtsp_url = 'RTSP URL must start with rtsp://';
    if (formData.lat && isNaN(parseFloat(formData.lat))) newErrors.lat = 'Invalid latitude';
    if (formData.lng && isNaN(parseFloat(formData.lng))) newErrors.lng = 'Invalid longitude';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTest = async () => {
    if (!formData.rtsp_url.trim()) { setErrors({ rtsp_url: 'Enter URL first' }); return; }
    setTesting(true); setTestResult(null);
    try {
      if (isEdit) {
        const res  = await apiFetch(`/cameras/${camera.id}/test`);
        const data = await res.json();
        setTestResult({ success: data.success, message: data.success ? 'Connection successful!' : (data.error || 'Connection failed') });
      } else {
        setTestResult({ success: true, message: 'URL format valid. Test connection after saving.' });
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Connection test failed' });
    } finally { setTesting(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = { ...formData, lat: formData.lat ? parseFloat(formData.lat) : null, lng: formData.lng ? parseFloat(formData.lng) : null, device_id: formData.device_id || null };
      const url    = isEdit ? `/cameras/${camera.id}` : '/cameras';
      const method = isEdit ? 'PATCH' : 'POST';
      const res    = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (data.success) { onSave(); }
      else alert(`Failed to save camera: ${data.error || 'Unknown error'}`);
    } catch (err) { console.error('Save camera error:', err); alert('Failed to save camera'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ component: 'form', onSubmit: handleSubmit }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {isEdit ? 'Edit Camera' : 'Add New Camera'}
        <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <TextField
          label="Camera Name" required size="small" fullWidth
          value={formData.name} onChange={e => handleChange('name', e.target.value)}
          error={!!errors.name} helperText={errors.name}
          placeholder="e.g., Main Entrance Camera"
        />

        <TextField
          select label="Camera Type" size="small" fullWidth
          value={formData.type} onChange={e => handleChange('type', e.target.value)}
        >
          <MenuItem value="RTSP">RTSP Camera</MenuItem>
          <MenuItem value="ESP32-CAM">ESP32-CAM</MenuItem>
          <MenuItem value="USB">USB Camera</MenuItem>
        </TextField>

        <Box>
          <TextField
            label={formData.type === 'RTSP' ? 'RTSP URL' : 'IP Address'} required size="small" fullWidth
            value={formData.rtsp_url} onChange={e => handleChange('rtsp_url', e.target.value)}
            error={!!errors.rtsp_url} helperText={errors.rtsp_url}
            placeholder={formData.type === 'RTSP' ? 'rtsp://username:password@192.168.1.100:554/stream' : '192.168.1.100'}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
            <Button size="small" variant="outlined" onClick={handleTest} disabled={testing || !formData.rtsp_url.trim()} startIcon={testing ? <Loader2 size={13} className="animate-spin" /> : null}>
              Test Connection
            </Button>
            {testResult && (
              <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} color={testResult.success ? 'success.main' : 'error.main'}>
                {testResult.success ? <CheckCircle size={13} /> : <AlertCircle size={13} />} {testResult.message}
              </Typography>
            )}
          </Box>
        </Box>

        <TextField label="Associated Device (Optional)" size="small" fullWidth value={formData.device_id} onChange={e => handleChange('device_id', e.target.value)} placeholder="e.g., ESP32_Zone_A" helperText="Link camera to an ESP32 zone for correlation" />
        <TextField label="Location Description" size="small" fullWidth value={formData.location} onChange={e => handleChange('location', e.target.value)} placeholder="e.g., Building A - Main Entrance" />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Latitude" size="small" value={formData.lat} onChange={e => handleChange('lat', e.target.value)} error={!!errors.lat} helperText={errors.lat} placeholder="24.7136" />
          <TextField label="Longitude" size="small" value={formData.lng} onChange={e => handleChange('lng', e.target.value)} error={!!errors.lng} helperText={errors.lng} placeholder="46.6753" />
        </Box>

        <Divider />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <FormControlLabel control={<Switch checked={formData.enabled} onChange={e => handleChange('enabled', e.target.checked)} />} label={<Box><Typography variant="body2" fontWeight={500}>Enable Camera</Typography><Typography variant="caption" color="text.secondary">Activate monitoring for this camera</Typography></Box>} />
          <FormControlLabel control={<Switch checked={formData.face_recognition_enabled} onChange={e => handleChange('face_recognition_enabled', e.target.checked)} />} label={<Box><Typography variant="body2" fontWeight={500}>Local Face Analysis</Typography><Typography variant="caption" color="text.secondary">Enable OpenCV face detection with overlays</Typography></Box>} />
          <FormControlLabel control={<Switch checked={formData.recording_enabled} onChange={e => handleChange('recording_enabled', e.target.checked)} />} label={<Box><Typography variant="body2" fontWeight={500}>Recording</Typography><Typography variant="caption" color="text.secondary">Save video clips on alert detection</Typography></Box>} />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={14} /> : null}>
          {isEdit ? 'Save Changes' : 'Add Camera'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

