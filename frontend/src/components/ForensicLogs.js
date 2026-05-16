import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import {
  Download, CheckCircle, Search, ChevronDown, ChevronUp,
} from 'lucide-react';
import { apiFetch } from '../apiBase';
import { severityColor, alertTypeIcon, formatTimestamp, formatRelative } from '../lib/utils';

const SEVERITIES  = ['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const ALERT_TYPES = ['all', 'FIRE', 'GAS_LEAK', 'EXPLOSION', 'INTRUDER', 'ANOMALY'];

function exportCSV(rows) {
  const headers = ['ID', 'Device', 'Type', 'Severity', 'AI Score', 'Timestamp', 'Resolved'];
  const lines   = [headers.join(','), ...rows.map(a => [a.id, a.device_id, a.alert_type, a.severity, a.ai_score?.toFixed(4) || '', a.timestamp, a.resolved ? 'Yes' : 'No'].join(','))];
  const blob    = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const link    = document.createElement('a');
  link.href = url; link.download = `forensic_logs_${Date.now()}.csv`;
  link.click(); URL.revokeObjectURL(url);
}

function AlertRow({ alert, selected, onSelect, onResolve }) {
  const theme    = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        hover selected={selected}
        onClick={() => setOpen(o => !o)}
        sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
      >
        <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onSelect} size="small" />
        </TableCell>
        <TableCell><Typography variant="caption" fontFamily="monospace" color="text.secondary">#{alert.id}</Typography></TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {alertTypeIcon(alert.alert_type, 14)}
            <Typography variant="body2" fontWeight={500}>{alert.alert_type}</Typography>
          </Box>
        </TableCell>
        <TableCell><Typography variant="body2" color="text.secondary">{alert.device_id}</Typography></TableCell>
        <TableCell>
          <Chip label={alert.severity} color={severityColor(alert.severity)} size="small" sx={{ fontWeight: 700, fontSize: '0.6rem' }} />
        </TableCell>
        <TableCell><Typography variant="caption" fontFamily="monospace" color="text.secondary">{alert.ai_score != null ? alert.ai_score.toFixed(4) : '—'}</Typography></TableCell>
        <TableCell>
          <Typography variant="caption" color="text.secondary" title={formatTimestamp(alert.timestamp)}>{formatRelative(alert.timestamp)}</Typography>
        </TableCell>
        <TableCell onClick={e => e.stopPropagation()}>
          {alert.resolved
            ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><CheckCircle size={12} color={theme.palette.success.main} /><Typography variant="caption" color="success.main">Resolved</Typography></Box>
            : <Button size="small" variant="outlined" color="success" sx={{ py: 0, px: 1, fontSize: '0.65rem' }} onClick={() => onResolve(alert.id)}>Resolve</Button>
          }
        </TableCell>
        <TableCell>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={9} sx={{ py: 0, border: 'none' }}>
          <Collapse in={open}>
            <Box sx={{ px: 3, py: 2, bgcolor: 'action.hover' }}>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Alert ID</Typography><Typography variant="body2" fontFamily="monospace">#{alert.id}</Typography></Grid>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Device</Typography><Typography variant="body2">{alert.device_id}</Typography></Grid>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Timestamp</Typography><Typography variant="body2">{formatTimestamp(alert.timestamp)}</Typography></Grid>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">AI Score</Typography><Typography variant="body2" fontFamily="monospace">{alert.ai_score?.toFixed(6) ?? '—'}</Typography></Grid>
                {alert.video_url && (
                  <Grid item xs={12}><Typography variant="caption" color="text.secondary">Video Evidence</Typography><Box component="video" src={alert.video_url} controls sx={{ display: 'block', borderRadius: 2, maxHeight: 160, bgcolor: '#000', mt: 0.5 }} /></Grid>
                )}
                {alert.notes && (
                  <Grid item xs={12}><Typography variant="caption" color="text.secondary">Notes</Typography><Typography variant="body2">{alert.notes}</Typography></Grid>
                )}
              </Grid>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function ForensicLogs({ alerts: propAlerts }) {
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter,     setTypeFilter]     = useState('all');
  const [search,         setSearch]         = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [selected,       setSelected]       = useState(new Set());
  const [localAlerts,    setLocalAlerts]    = useState(null);

  const alerts   = useMemo(() => localAlerts ?? propAlerts ?? [], [localAlerts, propAlerts]);
  const filtered = useMemo(() => alerts.filter(a => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && a.alert_type !== typeFilter) return false;
    if (dateFrom && a.timestamp < dateFrom) return false;
    if (dateTo   && a.timestamp > dateTo + 'T23:59:59') return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.device_id?.toLowerCase().includes(q) && !a.alert_type?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [alerts, severityFilter, typeFilter, search, dateFrom, dateTo]);

  const allSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(filtered.map(a => a.id)));
  const toggleOne   = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const resolveAlert = async (id) => {
    try {
      await apiFetch(`/alerts/${id}/resolve`, { method: 'PATCH' });
      setLocalAlerts(prev => (prev ?? alerts).map(a => a.id === id ? { ...a, resolved: 1 } : a));
    } catch {}
  };
  const resolveSelected = async () => { for (const id of selected) await resolveAlert(id); setSelected(new Set()); };

  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
            <TextField
              size="small" placeholder="Search device or type…" value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ flex: '1 1 200px' }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Severity</InputLabel>
              <Select value={severityFilter} label="Severity" onChange={e => setSeverityFilter(e.target.value)}>
                {SEVERITIES.map(s => <MenuItem key={s} value={s}>{s === 'all' ? 'All Severities' : s}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Type</InputLabel>
              <Select value={typeFilter} label="Type" onChange={e => setTypeFilter(e.target.value)}>
                {ALERT_TYPES.map(t => <MenuItem key={t} value={t}>{t === 'all' ? 'All Types' : t}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <TextField size="small" type="date" label="To"   InputLabelProps={{ shrink: true }} value={dateTo}   onChange={e => setDateTo(e.target.value)} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {selected.size > 0 && (
                <Button size="small" variant="outlined" color="success" startIcon={<CheckCircle size={13} />} onClick={resolveSelected}>
                  Resolve {selected.size}
                </Button>
              )}
              <Button size="small" variant="outlined" startIcon={<Download size={13} />} onClick={() => exportCSV(filtered)}>Export CSV</Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox"><Checkbox size="small" checked={allSelected} onChange={toggleAll} indeterminate={selected.size > 0 && !allSelected} /></TableCell>
              {['#', 'Type', 'Device', 'Severity', 'AI Score', 'Time', 'Status', ''].map(h => (
                <TableCell key={h}><Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>{h}</Typography></TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(a => (
              <AlertRow key={a.id} alert={a} selected={selected.has(a.id)} onSelect={() => toggleOne(a.id)} onResolve={resolveAlert} />
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ textAlign: 'center', py: 8 }}>
                  <CheckCircle size={36} color="#ccc" style={{ margin: '0 auto 8px' }} />
                  <Typography variant="body2" color="text.disabled">No alerts match your filters</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default ForensicLogs;

