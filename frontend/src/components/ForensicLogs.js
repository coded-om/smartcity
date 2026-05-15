import React, { useState, useMemo } from 'react';
import {
  Download, CheckCircle,
  Search, ChevronDown, ChevronUp,
} from 'lucide-react';
import { apiFetch } from '../apiBase';
import { cn, severityBg, alertTypeIcon, formatTimestamp, formatRelative } from '../lib/utils';

const SEVERITIES = ['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const ALERT_TYPES = ['all', 'FIRE', 'GAS_LEAK', 'EXPLOSION', 'INTRUDER', 'ANOMALY'];

function exportCSV(rows) {
  const headers = ['ID', 'Device', 'Type', 'Severity', 'AI Score', 'Timestamp', 'Resolved'];
  const lines = [
    headers.join(','),
    ...rows.map(a => [
      a.id, a.device_id, a.alert_type, a.severity,
      a.ai_score?.toFixed(4) || '', a.timestamp, a.resolved ? 'Yes' : 'No',
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `forensic_logs_${Date.now()}.csv`;
  link.click(); URL.revokeObjectURL(url);
}

function AlertRow({ alert, selected, onSelect, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className={cn(
          'border-b border-surface-600 hover:bg-surface-700 transition-colors cursor-pointer',
          selected && 'bg-primary-500/10',
        )}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3 w-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={e => { e.stopPropagation(); onSelect(); }}
            className="w-4 h-4 accent-primary-500"
            onClick={e => e.stopPropagation()}
          />
        </td>
        <td className="px-4 py-3 text-slate-400 text-sm font-mono">#{alert.id}</td>
        <td className="px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <span className="shrink-0">{alertTypeIcon(alert.alert_type)}</span>
            <span className="text-white font-medium">{alert.alert_type}</span>
          </span>
        </td>
        <td className="px-4 py-3 text-slate-300 text-sm">{alert.device_id}</td>
        <td className="px-4 py-3">
          <span className={cn('text-xs font-bold px-2 py-1 rounded-full border', severityBg(alert.severity))}>
            {alert.severity}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-400 text-xs font-mono">
          {alert.ai_score != null ? alert.ai_score.toFixed(4) : '—'}
        </td>
        <td className="px-4 py-3 text-slate-400 text-xs">
          <span title={formatTimestamp(alert.timestamp)}>{formatRelative(alert.timestamp)}</span>
        </td>
        <td className="px-4 py-3">
          {alert.resolved
            ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={12} /> Resolved</span>
            : <button
                onClick={e => { e.stopPropagation(); onResolve(alert.id); }}
                className="text-xs text-primary-400 hover:text-primary-300 border border-primary-500/30 rounded px-2 py-0.5 transition-colors"
              >Resolve</button>
          }
        </td>
        <td className="px-4 py-3 text-slate-500 text-sm">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-800">
          <td colSpan={9} className="px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div><p className="text-slate-500">Alert ID</p><p className="text-white font-mono">#{alert.id}</p></div>
              <div><p className="text-slate-500">Device</p><p className="text-white">{alert.device_id}</p></div>
              <div><p className="text-slate-500">Timestamp</p><p className="text-white">{formatTimestamp(alert.timestamp)}</p></div>
              <div><p className="text-slate-500">AI Score</p><p className="text-white font-mono">{alert.ai_score?.toFixed(6) ?? '—'}</p></div>
              {alert.video_url && (
                <div className="col-span-4">
                  <p className="text-slate-500 mb-1">Video Evidence</p>
                  <video src={alert.video_url} controls className="rounded-lg max-h-40 bg-black" />
                </div>
              )}
              {alert.notes && (
                <div className="col-span-4"><p className="text-slate-500">Notes</p><p className="text-white">{alert.notes}</p></div>
              )}
            </div>
          </td>
        </tr>
      )}
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
  const [resolving,      setResolving]      = useState(new Set());
  const [localAlerts,    setLocalAlerts]    = useState(null);

  const alerts = useMemo(() => localAlerts ?? propAlerts ?? [], [localAlerts, propAlerts]);

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (typeFilter !== 'all' && a.alert_type !== typeFilter) return false;
      if (dateFrom && a.timestamp < dateFrom) return false;
      if (dateTo   && a.timestamp > dateTo + 'T23:59:59') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.device_id?.toLowerCase().includes(q) &&
            !a.alert_type?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [alerts, severityFilter, typeFilter, search, dateFrom, dateTo]);

  const allSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(a => a.id)));
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const resolveAlert = async (id) => {
    setResolving(r => new Set(r).add(id));
    try {
      await apiFetch(`/alerts/${id}/resolve`, { method: 'PATCH' });
      setLocalAlerts(prev => (prev ?? alerts).map(a => a.id === id ? { ...a, resolved: 1 } : a));
    } catch {}
    setResolving(r => { const n = new Set(r); n.delete(id); return n; });
  };

  const resolveSelected = async () => {
    for (const id of selected) await resolveAlert(id);
    setSelected(new Set());
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl p-4 space-y-3">
        {}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search device or type…"
              className="w-full bg-surface-700 border border-surface-500 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-primary-500 transition-colors placeholder:text-slate-600"
            />
          </div>
          <select
            value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
            className="bg-surface-700 border border-surface-500 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
          >
            {SEVERITIES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Severities' : s}</option>)}
          </select>
          <select
            value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-surface-700 border border-surface-500 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
          >
            {ALERT_TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-surface-700 border border-surface-500 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
          />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-surface-700 border border-surface-500 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
          />
        </div>

        {}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <p className="text-slate-500 text-sm">{filtered.length} results</p>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <button
                onClick={resolveSelected}
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
              <CheckCircle size={12} /> Resolve {selected.size} selected
              </button>
            )}
            <button
              onClick={() => exportCSV(filtered)}
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-primary-500/10 border border-primary-500/30 text-primary-300 hover:bg-primary-500/20 transition-colors"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {}
      <div className="bg-surface-600 border border-surface-500 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-surface-500 bg-surface-800">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-4 h-4 accent-primary-500" />
                </th>
                {['#', 'Type', 'Device', 'Severity', 'AI Score', 'Time', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  selected={selected.has(a.id)}
                  onSelect={() => toggleOne(a.id)}
                  onResolve={resolveAlert}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500">
                    <CheckCircle size={36} className="mx-auto mb-3 text-slate-600" />
                    <p>No alerts match your filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ForensicLogs;
