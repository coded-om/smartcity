import React, { useState, useEffect, useRef } from 'react';
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
import Avatar from '@mui/material/Avatar';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import { X, Upload, CheckCircle, AlertCircle, User, Info } from 'lucide-react';
import { apiFetch, getPersonPhotoUrl } from '../apiBase';

export default function PersonModal({ person, onClose, onSave }) {
  const isEdit      = Boolean(person);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '', employee_id: '', role: '', department: '', authorized: true, notes: '',
  });
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [errors,       setErrors]       = useState({});
  const [dragActive,   setDragActive]   = useState(false);

  useEffect(() => {
    if (person) {
      setFormData({ name: person.name || '', employee_id: person.employee_id || '', role: person.role || '', department: person.department || '', authorized: person.authorized !== 0, notes: person.notes || '' });
      if (person.id) setPhotoPreview(getPersonPhotoUrl(person.id));
    }
  }, [person]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (file) => {
    if (!file.type.match('image.*')) { setErrors({ photo: 'Please select an image file (JPEG or PNG)' }); return; }
    if (file.size > 5 * 1024 * 1024) { setErrors({ photo: 'Image size must be less than 5MB' }); return; }
    setPhotoFile(file); setErrors(prev => ({ ...prev, photo: null }));
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  };
  const handleFileInputChange = (e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim())        newErrors.name        = 'Name is required';
    if (!formData.employee_id.trim()) newErrors.employee_id = 'Employee ID is required';
    if (!isEdit && !photoFile)        newErrors.photo       = 'Photo is required for new person';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', formData.name);
      fd.append('employee_id', formData.employee_id);
      fd.append('role', formData.role || '');
      fd.append('department', formData.department || '');
      fd.append('authorized', formData.authorized ? '1' : '0');
      fd.append('notes', formData.notes || '');
      if (photoFile) fd.append('photo', photoFile);
      const url    = isEdit ? `/persons/${person.id}` : '/persons';
      const method = isEdit ? 'PATCH' : 'POST';
      const res    = await apiFetch(url, { method, body: fd });
      const data   = await res.json();
      if (data.success) { onSave(); }
      else alert(`Failed to save person: ${data.error || 'Unknown error'}`);
    } catch (err) { console.error('Save person error:', err); alert('Failed to save person'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ component: 'form', onSubmit: handleSubmit }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><User size={18} />{isEdit ? 'Edit Person' : 'Register New Person'}</Box>
        <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {/* Photo upload */}
        <Box>
          <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>Photo {!isEdit && <Typography component="span" color="error">*</Typography>}</Typography>
          <Box
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: `2px dashed`,
              borderColor: dragActive ? 'primary.main' : errors.photo ? 'error.main' : 'divider',
              borderRadius: 2, p: 3, textAlign: 'center', cursor: 'pointer',
              bgcolor: dragActive ? 'primary.light' : 'action.hover',
              '&:hover': { borderColor: 'primary.light' },
              transition: 'all 0.2s',
            }}
          >
            {photoPreview ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                <Avatar src={photoPreview} sx={{ width: 120, height: 120, borderRadius: 2 }} />
                <Typography variant="caption" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><CheckCircle size={13} /> Photo selected – click to change</Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                <Upload size={32} />
                <Typography variant="body2" fontWeight={500}>Drop photo here or click to browse</Typography>
                <Typography variant="caption" color="text.disabled">JPEG or PNG, max 5MB</Typography>
              </Box>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/jpg" onChange={handleFileInputChange} style={{ display: 'none' }} />
          </Box>
          {errors.photo && <Typography variant="caption" color="error" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}><AlertCircle size={12} />{errors.photo}</Typography>}
          {!isEdit && <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}><Info size={11} /> Photo will be used for face recognition. Ensure face is clearly visible and well-lit.</Typography>}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Full Name" required size="small" value={formData.name} onChange={e => handleChange('name', e.target.value)} error={!!errors.name} helperText={errors.name} placeholder="Ahmed Al-Mutairi" />
          <TextField label="Employee ID" required size="small" value={formData.employee_id} onChange={e => handleChange('employee_id', e.target.value)} error={!!errors.employee_id} helperText={errors.employee_id} placeholder="EMP-001" />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField select label="Role" size="small" value={formData.role} onChange={e => handleChange('role', e.target.value)}>
            {['', 'Security', 'Manager', 'Engineer', 'Technician', 'Administrator', 'Visitor', 'Contractor', 'Other'].map(r => <MenuItem key={r} value={r}>{r || 'Select role…'}</MenuItem>)}
          </TextField>
          <TextField label="Department" size="small" value={formData.department} onChange={e => handleChange('department', e.target.value)} placeholder="Operations" />
        </Box>

        <FormControlLabel
          control={<Switch checked={formData.authorized} onChange={e => handleChange('authorized', e.target.checked)} />}
          label={
            <Box>
              <Typography variant="body2" fontWeight={500}>Authorized Personnel <Typography component="span" variant="caption" color={formData.authorized ? 'success.main' : 'error.main'}>{formData.authorized ? '✓ Authorized' : '⚠ Unauthorized'}</Typography></Typography>
              <Typography variant="caption" color="text.secondary">{formData.authorized ? 'This person is authorized to access the facility' : 'This person is flagged as unauthorized — alerts will be triggered'}</Typography>
            </Box>
          }
        />

        <TextField label="Notes" size="small" multiline minRows={2} fullWidth value={formData.notes} onChange={e => handleChange('notes', e.target.value)} placeholder="Optional notes…" />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={14} /> : null}>
          {isEdit ? 'Save Changes' : 'Register Person'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

