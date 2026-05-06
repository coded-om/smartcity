import React, { useState, useEffect } from 'react';
import {
  FiSettings, FiCamera, FiUsers, FiBell, FiPlus, FiEdit2, FiTrash2,
  FiRefreshCw, FiSearch, FiUser,
} from 'react-icons/fi';
import { apiFetch } from '../apiBase';
import { cn } from '../lib/utils';
import Cameras from './Cameras';
import PersonModal from './PersonModal';

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-lg transition-all',
        active
          ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
          : 'text-slate-400 hover:text-white hover:bg-surface-700 border border-transparent'
      )}
    >
      <Icon className="text-base" />
      {label}
    </button>
  );
}

function PersonManagementTab() {
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);

  const loadPersons = async () => {
    try {
      const res = await apiFetch('/persons');
      const data = await res.json();
      if (data.success) {
        setPersons(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load persons:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPersons();
  }, []);

  const handleAdd = () => {
    setEditingPerson(null);
    setModalOpen(true);
  };

  const handleEdit = (person) => {
    setEditingPerson(person);
    setModalOpen(true);
  };

  const handleDelete = async (person) => {
    if (!window.confirm(`Delete person "${person.name}"? This will also remove their face encoding.`)) {
      return;
    }

    try {
      const res = await apiFetch(`/persons/${person.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadPersons();
      } else {
        alert(`Failed to delete person: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Delete person error:', err);
      alert('Failed to delete person');
    }
  };

  const handleSave = async () => {
    setModalOpen(false);
    await loadPersons();
  };

  const filteredPersons = persons.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.employee_id?.toLowerCase().includes(q) ||
      p.role?.toLowerCase().includes(q) ||
      p.department?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <FiRefreshCw className="animate-spin text-5xl text-blue-500 mb-4" />
        <p className="text-lg">Loading persons...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <FiUsers className="text-primary-400" />
            Person Management
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {persons.length} registered person{persons.length !== 1 ? 's' : ''}
          </p>
        </div>

        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
        >
          <FiPlus />
          Register Person
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, employee ID, role, or department..."
          className="w-full pl-12 pr-4 py-3 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Empty state */}
      {persons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <FiUser className="text-6xl mb-4 text-slate-700" />
          <p className="text-lg font-medium mb-2">No persons registered</p>
          <p className="text-sm mb-6">Register employees for face recognition</p>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            <FiPlus />
            Register Person
          </button>
        </div>
      ) : filteredPersons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <FiSearch className="text-6xl mb-4 text-slate-700" />
          <p className="text-lg font-medium">No matching persons found</p>
        </div>
      ) : (
        /* Table */
        <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-900 border-b border-surface-700">
                <tr className="text-left">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Photo</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Name</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Employee ID</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Role</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Department</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersons.map((person) => (
                  <tr key={person.id} className="border-b border-surface-700 hover:bg-surface-800/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="w-12 h-12 rounded-lg bg-surface-900 border border-surface-600 overflow-hidden flex items-center justify-center">
                        {person.photo_path ? (
                          <img
                            src={`http://localhost:5000/api/persons/${person.id}/photo`}
                            alt={person.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.parentElement.innerHTML = '<div class="text-slate-600 text-xs"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg></div>';
                            }}
                          />
                        ) : (
                          <FiUser className="text-slate-600 text-xl" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-sm text-white">{person.name}</p>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-400">
                      <code className="px-2 py-1 rounded bg-surface-900 border border-surface-600 text-xs">
                        {person.employee_id}
                      </code>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-400">
                      {person.role || '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-400">
                      {person.department || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {person.authorized ? (
                        <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-900/20 text-emerald-300 border border-emerald-700/30">
                          Authorized
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs font-bold bg-red-900/20 text-red-300 border border-red-700/30">
                          Unauthorized
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(person)}
                          className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="text-sm" />
                        </button>
                        <button
                          onClick={() => handleDelete(person)}
                          className="p-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="text-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Person Modal */}
      {modalOpen && (
        <PersonModal
          person={editingPerson}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function AlertThresholdsTab() {
  const [thresholds, setThresholds] = useState({
    temperature: 35,
    gas: 2100,
    humidity: 70,
    noise: 80,
    motion_sensitivity: 50,
  });

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const handleChange = (field, value) => {
    setThresholds(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate save - in real app would POST to /api/settings/thresholds
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLastSaved(new Date());
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          <FiBell className="text-primary-400" />
          Alert Thresholds
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Configure sensor thresholds for triggering alerts
        </p>
      </div>

      <div className="space-y-6">
        {/* Temperature */}
        <div className="p-6 bg-surface-800 rounded-xl border border-surface-600">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Temperature Threshold</h3>
              <p className="text-slate-500 text-sm">Alert when temperature exceeds this value</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-400">{thresholds.temperature}°C</p>
            </div>
          </div>
          <input
            type="range"
            min="25"
            max="50"
            value={thresholds.temperature}
            onChange={(e) => handleChange('temperature', parseInt(e.target.value))}
            className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-2">
            <span>25°C</span>
            <span>50°C</span>
          </div>
        </div>

        {/* Gas */}
        <div className="p-6 bg-surface-800 rounded-xl border border-surface-600">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Gas Level Threshold</h3>
              <p className="text-slate-500 text-sm">Alert when gas level exceeds this value</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-400">{thresholds.gas} ppm</p>
            </div>
          </div>
          <input
            type="range"
            min="1000"
            max="5000"
            step="100"
            value={thresholds.gas}
            onChange={(e) => handleChange('gas', parseInt(e.target.value))}
            className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-2">
            <span>1000 ppm</span>
            <span>5000 ppm</span>
          </div>
        </div>

        {/* Humidity */}
        <div className="p-6 bg-surface-800 rounded-xl border border-surface-600">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Humidity Threshold</h3>
              <p className="text-slate-500 text-sm">Alert when humidity exceeds this value</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-400">{thresholds.humidity}%</p>
            </div>
          </div>
          <input
            type="range"
            min="40"
            max="90"
            value={thresholds.humidity}
            onChange={(e) => handleChange('humidity', parseInt(e.target.value))}
            className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-2">
            <span>40%</span>
            <span>90%</span>
          </div>
        </div>

        {/* Noise */}
        <div className="p-6 bg-surface-800 rounded-xl border border-surface-600">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Noise Threshold</h3>
              <p className="text-slate-500 text-sm">Alert when noise level exceeds this value</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-400">{thresholds.noise} dB</p>
            </div>
          </div>
          <input
            type="range"
            min="50"
            max="120"
            value={thresholds.noise}
            onChange={(e) => handleChange('noise', parseInt(e.target.value))}
            className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-2">
            <span>50 dB</span>
            <span>120 dB</span>
          </div>
        </div>

        {/* Motion Sensitivity */}
        <div className="p-6 bg-surface-800 rounded-xl border border-surface-600">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Motion Detection Sensitivity</h3>
              <p className="text-slate-500 text-sm">Adjust motion sensor sensitivity</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-cyan-400">
                {thresholds.motion_sensitivity}%
              </p>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={thresholds.motion_sensitivity}
            onChange={(e) => handleChange('motion_sensitivity', parseInt(e.target.value))}
            className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-2">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between p-4 bg-surface-900 rounded-lg border border-surface-600">
        {lastSaved && (
          <p className="text-sm text-slate-500">
            Last saved: {lastSaved.toLocaleTimeString()}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-2 px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-primary-800 text-white font-medium transition-colors"
        >
          {saving && <FiRefreshCw className="animate-spin" />}
          Save Thresholds
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('cameras');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FiSettings className="text-primary-400" />
            Settings
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure system settings and parameters
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <TabButton
          active={activeTab === 'cameras'}
          onClick={() => setActiveTab('cameras')}
          icon={FiCamera}
          label="Cameras"
        />
        <TabButton
          active={activeTab === 'persons'}
          onClick={() => setActiveTab('persons')}
          icon={FiUsers}
          label="Person Management"
        />
        <TabButton
          active={activeTab === 'thresholds'}
          onClick={() => setActiveTab('thresholds')}
          icon={FiBell}
          label="Alert Thresholds"
        />
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'cameras' && <Cameras />}
        {activeTab === 'persons' && <PersonManagementTab />}
        {activeTab === 'thresholds' && <AlertThresholdsTab />}
      </div>
    </div>
  );
}
