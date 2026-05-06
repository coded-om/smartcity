import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function severityColor(severity) {
  switch (severity) {
    case 'CRITICAL': return 'text-red-400';
    case 'HIGH':     return 'text-orange-400';
    case 'MEDIUM':   return 'text-yellow-400';
    default:         return 'text-green-400';
  }
}

export function severityBg(severity) {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-500/20 border-red-500/40 text-red-300';
    case 'HIGH':     return 'bg-orange-500/20 border-orange-500/40 text-orange-300';
    case 'MEDIUM':   return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300';
    default:         return 'bg-green-500/20 border-green-500/40 text-green-300';
  }
}

export function alertTypeIcon(type) {
  switch (type) {
    case 'FIRE':      return '🔥';
    case 'GAS_LEAK':  return '☁️';
    case 'EXPLOSION': return '💥';
    case 'INTRUDER':  return '🚨';
    case 'ANOMALY':   return '⚠️';
    default:          return '✅';
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
