import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, AlertOctagon, AlertTriangle, Eye, X, Wifi } from 'lucide-react';
import { cn } from '../lib/utils';
import getSocket from '../socketClient';

const MAX_THREATS = 20;

const SEVERITY_STYLES = {
  CRITICAL: {
    bg:     'bg-accent-900/60',
    border: 'border-accent-500/60',
    text:   'text-accent-200',
    badge:  'bg-accent-500/30 text-accent-200',
    icon:   <AlertOctagon size={14} className="text-accent-400 shrink-0" />,
    pulse:  'bg-accent-500',
  },
  HIGH: {
    bg:     'bg-coral-900/60',
    border: 'border-coral-500/50',
    text:   'text-coral-200',
    badge:  'bg-coral-500/30 text-coral-200',
    icon:   <AlertTriangle size={14} className="text-coral-400 shrink-0" />,
    pulse:  'bg-coral-500',
  },
  MEDIUM: {
    bg:     'bg-bronze-900/60',
    border: 'border-bronze-500/40',
    text:   'text-bronze-200',
    badge:  'bg-bronze-500/20 text-bronze-200',
    icon:   <AlertTriangle size={14} className="text-bronze-400 shrink-0" />,
    pulse:  'bg-bronze-400',
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
      'flex items-center gap-3 px-3 py-2.5 rounded-xl border',
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
      <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full', s.badge)}>
        {threat.severity}
      </span>
      {onViewCamera && (
        <button
          onClick={() => onViewCamera(threat.camera_id)}
          className="text-slate-400 hover:text-primary-300 transition-colors shrink-0"
          title="View camera"
        >
          <Eye size={13} />
        </button>
      )}
    </div>
  );
}

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
      activeCritical > 0 ? 'border-accent-500/50' : 'border-surface-500',
      className,
    )}>
      {}
      <div className={cn(
        'flex items-center justify-between px-4 py-3 border-b',
        activeCritical > 0 ? 'border-accent-500/30 bg-accent-900/20' : 'border-surface-500 bg-surface-800',
      )}>
        <div className="flex items-center gap-2">
          <Shield size={15} className={activeCritical > 0 ? 'text-accent-400' : 'text-slate-400'} />
          <span className="text-white text-sm font-semibold">Live Threats</span>
          {threats.length > 0 && (
            <span className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-full',
              activeCritical > 0 ? 'bg-accent-500/30 text-accent-200' : 'bg-surface-500 text-slate-300',
            )}>
              {threats.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <Wifi size={11} className={connected ? 'text-emerald-400' : 'text-slate-600'} />
            {connected ? 'live' : 'offline'}
          </span>
          {threats.length > 0 && (
            <button
              onClick={() => setThreats([])}
              className="text-[10px] text-slate-500 hover:text-white transition-colors flex items-center gap-1"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>
      </div>

      {}
      <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto">
        {threats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-600 gap-1.5">
            <Shield size={24} />
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
