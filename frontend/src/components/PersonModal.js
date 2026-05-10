import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiUpload, FiCheckCircle, FiAlertCircle, FiLoader, FiUser } from 'react-icons/fi';
import { apiFetch, getPersonPhotoUrl } from '../apiBase';
import { cn } from '../lib/utils';

export default function PersonModal({ person, onClose, onSave }) {
  const isEdit = Boolean(person);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    employee_id: '',
    role: '',
    department: '',
    authorized: true,
    notes: '',
  });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (person) {
      setFormData({
        name: person.name || '',
        employee_id: person.employee_id || '',
        role: person.role || '',
        department: person.department || '',
        authorized: person.authorized !== 0,
        notes: person.notes || '',
      });
      // Load existing photo if available
      if (person.id) {
        setPhotoPreview(getPersonPhotoUrl(person.id));
      }
    }
  }, [person]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file) => {
    if (!file.type.match('image.*')) {
      setErrors({ photo: 'Please select an image file (JPEG or PNG)' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrors({ photo: 'Image size must be less than 5MB' });
      return;
    }

    setPhotoFile(file);
    setErrors(prev => ({ ...prev, photo: null }));

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.employee_id.trim()) {
      newErrors.employee_id = 'Employee ID is required';
    }

    if (!isEdit && !photoFile) {
      newErrors.photo = 'Photo is required for new person';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('employee_id', formData.employee_id);
      formDataToSend.append('role', formData.role || '');
      formDataToSend.append('department', formData.department || '');
      formDataToSend.append('authorized', formData.authorized ? '1' : '0');
      formDataToSend.append('notes', formData.notes || '');
      
      if (photoFile) {
        formDataToSend.append('photo', photoFile);
      }

      const url = isEdit ? `/persons/${person.id}` : '/persons';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: formDataToSend,
        // Don't set Content-Type header - browser will set it with boundary for multipart
      });

      const data = await res.json();

      if (data.success) {
        onSave();
      } else {
        alert(`Failed to save person: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Save person error:', err);
      alert('Failed to save person');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-800 rounded-xl border border-surface-600 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-600">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FiUser className="text-primary-400" />
            {isEdit ? 'Edit Person' : 'Register New Person'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-700 text-slate-400 hover:text-white transition-colors"
          >
            <FiX />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Photo {!isEdit && <span className="text-red-400">*</span>}
            </label>
            
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
                dragActive
                  ? 'border-primary-500 bg-primary-500/10'
                  : errors.photo
                  ? 'border-red-500 bg-red-500/5'
                  : 'border-surface-600 hover:border-primary-700 bg-surface-900'
              )}
            >
              {photoPreview ? (
                <div className="flex flex-col items-center gap-4">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-48 h-48 object-cover rounded-lg border-2 border-surface-600"
                  />
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <FiCheckCircle />
                    Photo selected - Click to change
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <FiUpload className="text-4xl" />
                  <div>
                    <p className="text-sm font-medium">
                      Drop photo here or click to browse
                    </p>
                    <p className="text-xs mt-1">
                      JPEG or PNG, max 5MB
                    </p>
                  </div>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>

            {errors.photo && (
              <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
                <FiAlertCircle />
                {errors.photo}
              </div>
            )}

            {!isEdit && (
              <p className="text-slate-500 text-xs mt-2">
                ℹ️ Photo will be used for face recognition. Ensure face is clearly visible and well-lit.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Ahmed Al-Mutairi"
                className={cn(
                  'w-full px-4 py-2 rounded-lg bg-surface-900 border text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500',
                  errors.name ? 'border-red-500' : 'border-surface-600'
                )}
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Employee ID */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Employee ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.employee_id}
                onChange={(e) => handleChange('employee_id', e.target.value)}
                placeholder="EMP-001"
                className={cn(
                  'w-full px-4 py-2 rounded-lg bg-surface-900 border text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500',
                  errors.employee_id ? 'border-red-500' : 'border-surface-600'
                )}
              />
              {errors.employee_id && <p className="text-red-400 text-xs mt-1">{errors.employee_id}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Role
              </label>
              <select
                value={formData.role}
                onChange={(e) => handleChange('role', e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select role...</option>
                <option value="Security">Security</option>
                <option value="Manager">Manager</option>
                <option value="Engineer">Engineer</option>
                <option value="Technician">Technician</option>
                <option value="Administrator">Administrator</option>
                <option value="Visitor">Visitor</option>
                <option value="Contractor">Contractor</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Department
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => handleChange('department', e.target.value)}
                placeholder="Operations"
                className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Authorized Toggle */}
          <div>
            <label className="flex items-center justify-between p-4 rounded-lg bg-surface-900 border border-surface-600 cursor-pointer hover:border-primary-700 transition-colors">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  Authorized Personnel
                  {formData.authorized ? (
                    <span className="text-emerald-400 text-xs">✓ Authorized</span>
                  ) : (
                    <span className="text-red-400 text-xs">⚠ Unauthorized</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {formData.authorized 
                    ? 'This person is authorized to access the facility'
                    : 'This person is flagged as unauthorized - alerts will be triggered'
                  }
                </p>
              </div>
              <input
                type="checkbox"
                checked={formData.authorized}
                onChange={(e) => handleChange('authorized', e.target.checked)}
                className="w-5 h-5 rounded bg-surface-800 border-surface-600 text-primary-500 focus:ring-2 focus:ring-primary-500"
              />
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Additional information about this person..."
              rows={3}
              className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
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
            {saving && <FiLoader className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Register Person'}
          </button>
        </div>
      </div>
    </div>
  );
}
