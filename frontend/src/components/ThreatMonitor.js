import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiShield, FiAlertOctagon, FiAlertTriangle, FiEye, FiX, FiWifi } from 'react-icons/fi';
import { cn } from '../lib/utils';
import getSocket from '../socketClient';

const MAX_THREATS = 20;  // keep the last N threats in the panel

const SEVERITY_STYLES = {
  CRITICAL: {
    bg:     'bg-red-900/80',
    border: 'border-red-500/70',
    text:   'text-red-200',
    badge:  'bg-red-500/30 text-red-200',
    icon:   <FiAlertOctagon className="text-red-400 shrink-0" />,
    pulse:  'bg-red-500',
  },
  HIGH: {
    bg:     'bg-orange-900/70',
    border: 'border-orange-500/60',
    text:   'text-orange-200',
    badge:  'bg-orange-500/30 text-orange-200',
    icon:   <FiAlertTriangle className="text-orange-400 shrink-0" />,
    pulse:  'bg-orange-500',
  },
  MEDIUM: {
    bg:     'bg-yellow-900/60',
    border: 'border-yellow-500/50',
    text:   'text-yellow-200',
    badge:  'bg-yellow-500/20 text-yellow-200',
    icon:   <FiAlertTriangle className="text-yellow-400 shrink-0" />,
    pulse:  'bg-yellow-400',
  },
};

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '—';
  }
}

function ThreatRow({ threat, onViewCamera }) {
  const s = SEVERITY_STYLES[threat.severity] || SEVERITY_STYLES.MEDIUM;
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg border',
      s.bg, s.border,
    )}>
      {s.icon}
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-bold truncate', s.text)}>
          {threat.threat_type?.replace('_', ' ')}
          {threat.weapon_class ? ` · ${threat.weapon_class.toUpperCase()}` : ''}
        </p>
        <p className="text-[10px] text-slate-400 truncate">
          {threat.camera_name || `Cam ${threat.camera_id}`} · {fmtTime(threat.timestamp)}
          {threat.confidence ? ` · ${Math.round(threat.confidence * 100)}%` : ''}
        </p>
      </div>
      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded', s.badge)}>
        {threat.severity}
      </span>
      {onViewCamera && (
        <button
          onClick={() => onViewCamera(threat.camera_id)}
          className="text-slate-400 hover:text-white transition-colors shrink-0"
          title="View camera"
        >
          <FiEye className="text-sm" />
        </button>
      )}
    </div>
  );
}

/**
 * ThreatMonitor — real-time threat feed via WebSocket.
 *
 * Props:
 *   onViewCamera(camera_id)  — called when user clicks "View" on a threat row.
 *   className                — extra CSS classes for the container.
 */
export default function ThreatMonitor({ onViewCamera, className }) {
  const [threats,   setThreats]   = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  const addThreat = useCallback((data) => {
    setThreats(prev => {
      const next = [{ ...data, _id: Date.now() + Math.random() }, ...prev];
      return next.slice(0, MAX_THREATS);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    getSocket().then((sock) => {
      if (cancelled) return;
      socketRef.current = sock;
      setConnected(sock.connected);

      sock.on('connect',    () => setConnected(true));
      sock.on('disconnect', () => setConnected(false));

      sock.on('threat_detected', addThreat);
      sock.on('weapon_detected', (data) => addThreat({
        ...data,
        threat_type: `WEAPON · ${(data.class_name || '').toUpperCase()}`,
        severity:    'CRITICAL',
        source:      'weapon',
      }));
    });

    return () => {
      cancelled = true;
      const sock = socketRef.current;
      if (sock) {
        sock.off('threat_detected', addThreat);
        sock.off('weapon_detected');
      }
    };
  }, [addThreat]);

  const activeCritical = threats.filter(t => t.severity === 'CRITICAL').length;

  return (
    <div className={cn(
      'bg-surface-700 border rounded-2xl overflow-hidden',
      activeCritical > 0 ? 'border-red-500/50' : 'border-surface-500',
      className,
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-4 py-3 border-b',
        activeCritical > 0 ? 'border-red-500/30 bg-red-900/20' : 'border-surface-500 bg-surface-800',
      )}>
        <div className="flex items-center gap-2">
          <FiShield className={activeCritical > 0 ? 'text-red-400' : 'text-slate-400'} />
          <span className="text-white text-sm font-semibold">Live Threats</span>
          {threats.length > 0 && (
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              activeCritical > 0 ? 'bg-red-500/30 text-red-200' : 'bg-slate-600 text-slate-300',
            )}>
              {threats.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* WebSocket indicator */}
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <FiWifi className={connected ? 'text-emerald-400' : 'text-slate-600'} />
            {connected ? 'live' : 'offline'}
          </span>
          {threats.length > 0 && (
            <button
              onClick={() => setThreats([])}
              className="text-[10px] text-slate-500 hover:text-white transition-colors flex items-center gap-1"
            >
              <FiX className="text-xs" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Threat list */}
      <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto">
        {threats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-600 gap-1.5">
            <FiShield className="text-2xl" />
            <p className="text-xs">No threats detected</p>
          </div>
        ) : (
          threats.map(t => (
            <ThreatRow key={t._id} threat={t} onViewCamera={onViewCamera} />
          ))
        )}
      </div>
    </div>
  );
}
