import React, { useState, useEffect } from 'react';
import { FiBell, FiSearch, FiWifi, FiWifiOff, FiMenu, FiX } from 'react-icons/fi';
import { cn, alertTypeIcon } from '../lib/utils';

const TITLES = {
  'overview':      'Overview',
  'live-monitor':  'Live Monitor',
  'forensic-logs': 'Forensic Logs',
  'ai-analysis':   'AI Analysis',
  'security-map':  'Security Map',
  'report-center': 'Report Center',
};

function Header({ activeView, stats, alerts, onMenuClick }) {
  const [searchOpen, setSearchOpen]   = useState(false);
  const [bellOpen,   setBellOpen]     = useState(false);
  const [tickerIdx,  setTickerIdx]    = useState(0);

  const openAlerts    = stats?.open_alerts    || 0;
  const totalReadings = stats?.total_readings || 0;
  const isConnected   = (stats?.devices_online || 0) > 0;

  // Rotate alert ticker every 4 seconds
  const recentAlerts = (alerts || []).filter(a => !a.resolved).slice(0, 5);
  useEffect(() => {
    if (recentAlerts.length < 2) return;
    const t = setInterval(() => setTickerIdx(i => (i + 1) % recentAlerts.length), 4000);
    return () => clearInterval(t);
  }, [recentAlerts.length]);

  const tickerAlert = recentAlerts[tickerIdx];

  return (
    <header className="shrink-0 bg-surface-800 border-b border-surface-600">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">

        {/* Left: hamburger + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-xl bg-surface-700 border border-surface-600 text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <FiMenu className="text-lg" />
          </button>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-lg truncate">
              {TITLES[activeView] || 'Overview'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              {isConnected
                ? <FiWifi className="text-emerald-400 text-xs shrink-0" />
                : <FiWifiOff className="text-red-400 text-xs shrink-0" />}
              <span className="text-slate-500 text-xs">
                {isConnected ? 'Live' : 'Offline'} · {totalReadings.toLocaleString()} readings
              </span>
            </div>
          </div>
        </div>

        {/* Alert ticker (desktop) */}
        {tickerAlert && (
          <div className="hidden md:flex flex-1 mx-4 items-center gap-2 bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 overflow-hidden max-w-sm">
            <span className="text-sm">{alertTypeIcon(tickerAlert.alert_type)}</span>
            <span className="text-xs text-slate-300 truncate">
              {tickerAlert.device_id} – {tickerAlert.alert_type}
            </span>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0',
              tickerAlert.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-300' :
              tickerAlert.severity === 'HIGH'     ? 'bg-orange-500/20 text-orange-300' :
                                                    'bg-yellow-500/20 text-yellow-300',
            )}>
              {tickerAlert.severity}
            </span>
          </div>
        )}

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop search */}
          <div className="relative hidden md:block">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none" />
            <input
              type="text"
              placeholder="Search events…"
              className="bg-surface-700 border border-surface-500 text-slate-300 text-sm rounded-xl pl-9 pr-4 py-2 w-52 focus:outline-none focus:border-primary-500 transition-colors placeholder:text-slate-600"
            />
          </div>

          {/* Mobile search toggle */}
          <button
            onClick={() => setSearchOpen(v => !v)}
            className="md:hidden p-2 rounded-xl bg-surface-700 border border-surface-600 text-slate-400 hover:text-white transition-colors"
          >
            {searchOpen ? <FiX /> : <FiSearch />}
          </button>

          {/* Bell with dropdown */}
          <div className="relative">
            <button
              onClick={() => setBellOpen(v => !v)}
              className="relative p-2 rounded-xl bg-surface-700 border border-surface-600 text-slate-400 hover:text-white transition-colors"
            >
              <FiBell className="text-lg" />
              {openAlerts > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {openAlerts > 9 ? '9+' : openAlerts}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-surface-700 border border-surface-500 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-2 border-b border-surface-500">
                  <p className="text-xs font-semibold text-slate-400">Recent Alerts ({openAlerts} open)</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {recentAlerts.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">No open alerts</p>
                  ) : recentAlerts.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-600 transition-colors">
                      <span className="text-base">{alertTypeIcon(a.alert_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-300 truncate">{a.device_id} – {a.alert_type}</p>
                        <p className="text-[10px] text-slate-500">{a.timestamp?.split('T')[0] || a.timestamp}</p>
                      </div>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0',
                        a.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-300' :
                        a.severity === 'HIGH'     ? 'bg-orange-500/20 text-orange-300' :
                                                    'bg-yellow-500/20 text-yellow-300',
                      )}>{a.severity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none" />
            <input
              autoFocus
              type="text"
              placeholder="Search sensor / event…"
              className="w-full bg-surface-700 border border-surface-500 text-slate-300 text-sm rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-primary-500 transition-colors placeholder:text-slate-600"
            />
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
