import React from 'react';
import { Flame, Wind, Zap, AlertOctagon, AlertTriangle, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function severityColor(severity) {
  switch (severity) {
    case 'CRITICAL': return 'text-accent-400';
    case 'HIGH':     return 'text-coral-400';
    case 'MEDIUM':   return 'text-bronze-400';
    default:         return 'text-emerald-400';
  }
}

export function severityBg(severity) {
  switch (severity) {
    case 'CRITICAL': return 'bg-accent-500/20 border-accent-500/40 text-accent-300';
    case 'HIGH':     return 'bg-coral-500/20 border-coral-500/40 text-coral-300';
    case 'MEDIUM':   return 'bg-bronze-500/20 border-bronze-500/40 text-bronze-300';
    default:         return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
  }
}

export function alertTypeIcon(type) {
  switch (type) {
    case 'FIRE':      return <Flame size={16} className="text-red-400" />;
    case 'GAS_LEAK':  return <Wind size={16} className="text-yellow-400" />;
    case 'EXPLOSION': return <Zap size={16} className="text-orange-400" />;
    case 'INTRUDER':  return <AlertOctagon size={16} className="text-accent-400" />;
    case 'ANOMALY':   return <AlertTriangle size={16} className="text-bronze-400" />;
    default:          return <CheckCircle size={16} className="text-emerald-400" />;
  }
}

export function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function formatRelative(ts) {
  if (!ts) return '—';
  try {
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return ts;
  }
}
