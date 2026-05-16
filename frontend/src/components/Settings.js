import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Slider from '@mui/material/Slider';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import {
  Settings as SettingsIcon, Camera, Users, Bell, Plus, Edit2, Trash2,
  RefreshCw, Search, User,
} from 'lucide-react';
import { apiFetch, getPersonPhotoUrl } from '../apiBase';
import Cameras from './Cameras';
import PersonModal from './PersonModal';

function PersonManagementTab() {
  const [persons,       setPersons]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);

  const loadPersons = async () => {
    try {
      const res  = await apiFetch('/persons');
      const data = await res.json();
      if (data.success) setPersons(data.data || []);
    } catch (err) { console.error('Failed to load persons:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPersons(); }, []);

  const handleAdd    = () => { setEditingPerson(null); setModalOpen(true); };
  const handleEdit   = (person) => { setEditingPerson(person); setModalOpen(true); };
  const handleSave   = async () => { setModalOpen(false); await loadPersons(); };
  const handleDelete = async (person) => {
    if (!window.confirm(`Delete person "${person.name}"? This will also remove their face encoding.`)) return;
    try {
      const res  = await apiFetch(`/persons/${person.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { await loadPersons(); }
      else alert(`Failed to delete person: ${data.error || 'Unknown error'}`);
    } catch (err) { console.error('Delete person error:', err); alert('Failed to delete person'); }
  };

  const filteredPersons = persons.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.employee_id?.toLowerCase().includes(q) || p.role?.toLowerCase().includes(q) || p.department?.toLowerCase().includes(q);
  });

  if (loading) return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
      <CircularProgress /><Typography color="text.secondary">Loading persons…</Typography>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Users size={18} /> Person Management</Typography>
          <Typography variant="body2" color="text.secondary">{persons.length} registered person{persons.length !== 1 ? 's' : ''}</Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={15} />} onClick={handleAdd}>Register Person</Button>
      </Box>
      <TextField
        fullWidth size="small" placeholder="Search by name, employee ID, role, or department…"
        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} sx={{ mb: 2 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }}
      />
      {persons.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <User size={42} color="#ccc" style={{ margin: '0 auto 12px' }} />
          <Typography variant="h6" color="text.secondary">No persons registered</Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>Register employees for face recognition</Typography>
          <Button variant="contained" startIcon={<Plus size={15} />} onClick={handleAdd}>Register Person</Button>
        </Box>
      ) : filteredPersons.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}><Typography variant="body1" color="text.disabled">No matching persons found</Typography></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Photo', 'Name', 'Employee ID', 'Role', 'Department', 'Status', ''].map(h => (
                  <TableCell key={h}><Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>{h}</Typography></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPersons.map(person => (
                <TableRow key={person.id} hover>
                  <TableCell>
                    <Avatar src={person.photo_path ? getPersonPhotoUrl(person.id) : undefined} sx={{ width: 40, height: 40, borderRadius: 1 }}>
                      <User size={18} />
                    </Avatar>
                  </TableCell>
                  <TableCell><Typography variant="body2" fontWeight={600}>{person.name}</Typography></TableCell>
                  <TableCell><Typography variant="caption" fontFamily="monospace" sx={{ bgcolor: 'action.hover', px: 0.75, py: 0.25, borderRadius: 1 }}>{person.employee_id}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{person.role || '—'}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{person.department || '—'}</Typography></TableCell>
                  <TableCell><Chip label={person.authorized ? 'Authorized' : 'Unauthorized'} color={person.authorized ? 'success' : 'error'} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} /></TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleEdit(person)}><Edit2 size={14} /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(person)}><Trash2 size={14} /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {modalOpen && <PersonModal person={editingPerson} onClose={() => setModalOpen(false)} onSave={handleSave} />}
    </Box>
  );
}

const THRESHOLD_FIELDS = [
  { key: 'temperature',         label: 'Temperature',           desc: 'Alert when temperature exceeds this value',     min: 25,   max: 50,   step: 1,   unit: '°C',  color: 'error'   },
  { key: 'gas',                 label: 'Gas Level',             desc: 'Alert when gas level exceeds this value',        min: 1000, max: 5000, step: 100, unit: ' ppm', color: 'warning' },
  { key: 'humidity',            label: 'Humidity',              desc: 'Alert when humidity exceeds this value',         min: 40,   max: 90,   step: 1,   unit: '%',    color: 'info'    },
  { key: 'noise',               label: 'Noise',                 desc: 'Alert when noise level exceeds this value',      min: 50,   max: 120,  step: 1,   unit: ' dB',  color: 'secondary' },
  { key: 'motion_sensitivity',  label: 'Motion Sensitivity',    desc: 'Adjust motion sensor sensitivity',               min: 0,    max: 100,  step: 1,   unit: '%',    color: 'success' },
];

function AlertThresholdsTab() {
  const theme = useTheme();
  const [thresholds, setThresholds] = useState({ temperature: 35, gas: 2100, humidity: 70, noise: 80, motion_sensitivity: 50 });
  const [saving,    setSaving]    = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const handleChange = (field, value) => setThresholds(prev => ({ ...prev, [field]: value }));
  const handleSave   = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLastSaved(new Date());
    setSaving(false);
  };

  return (
    <Box sx={{ maxWidth: 700 }}>
      <Typography variant="h6" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}><Bell size={18} /> Alert Thresholds</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Configure sensor thresholds for triggering alerts</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {THRESHOLD_FIELDS.map(f => (
          <Card key={f.key}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>{f.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{f.desc}</Typography>
                </Box>
                <Typography variant="h5" fontWeight={700} color={`${f.color}.main`}>{thresholds[f.key]}{f.unit}</Typography>
              </Box>
              <Slider
                value={thresholds[f.key]} min={f.min} max={f.max} step={f.step}
                onChange={(_, v) => handleChange(f.key, v)}
                color={f.color}
                valueLabelDisplay="auto"
                marks={[{ value: f.min, label: `${f.min}${f.unit}` }, { value: f.max, label: `${f.max}${f.unit}` }]}
              />
            </CardContent>
          </Card>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
        {lastSaved
          ? <Typography variant="body2" color="text.secondary">Last saved: {lastSaved.toLocaleTimeString()}</Typography>
          : <Box />
        }
        <Button variant="contained" disabled={saving} startIcon={saving ? <RefreshCw size={14} className="animate-spin" /> : null} onClick={handleSave}>Save Thresholds</Button>
      </Box>
    </Box>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState(0);
  const TABS = [{ label: 'Cameras', icon: <Camera size={16} /> }, { label: 'Persons', icon: <Users size={16} /> }, { label: 'Thresholds', icon: <Bell size={16} /> }];

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      <Typography variant="h5" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}><SettingsIcon size={22} /> Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Configure system settings and parameters</Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          {TABS.map((t, i) => (
            <Tab key={i} label={t.label} icon={t.icon} iconPosition="start" sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
      </Box>
      {activeTab === 0 && <Cameras />}
      {activeTab === 1 && <PersonManagementTab />}
      {activeTab === 2 && <AlertThresholdsTab />}
    </Box>
  );
}

