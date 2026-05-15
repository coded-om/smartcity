import React, { useState, useEffect } from 'react';
import { Bell, Search, Wifi, WifiOff, Menu, X, Sun, Moon } from 'lucide-react';
import { cn, alertTypeIcon, severityBg } from '../lib/utils';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

const TITLES = {
  'overview':      'Overview',
  'live-monitor':  'Live Monitor',
  'forensic-logs': 'Forensic Logs',
  'ai-analysis':   'AI Analysis',
  'security-map':  'Security Map',
  'report-center': 'Report Center',
  'cameras':       'Cameras',
  'settings':      'Settings',
};

function Header({ activeView, stats, alerts, onMenuClick, theme, toggleTheme }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [tickerIdx,  setTickerIdx]  = useState(0);

  const openAlerts    = stats?.open_alerts    || 0;
  const totalReadings = stats?.total_readings || 0;
  const isConnected   = (stats?.devices_online || 0) > 0;

  const recentAlerts = (alerts || []).filter(a => !a.resolved).slice(0, 10);
  useEffect(() => {
    if (recentAlerts.length < 2) return;
    const t = setInterval(() => setTickerIdx(i => (i + 1) % recentAlerts.length), 4000);
    return () => clearInterval(t);
  }, [recentAlerts.length]);

  const tickerAlert = recentAlerts[tickerIdx];

  return (
    <header className="shrink-0 bg-surface-900 border-b border-surface-700">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">

        {}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-xl bg-surface-700 border border-surface-600 text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-lg truncate">
              {TITLES[activeView] || 'Overview'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isConnected
                ? <Wifi size={11} className="text-emerald-400 shrink-0" />
                : <WifiOff size={11} className="text-accent-400 shrink-0" />}
              <span className="text-slate-500 text-xs">
                {isConnected ? 'Live' : 'Offline'} · {totalReadings.toLocaleString()} readings
              </span>
            </div>
          </div>
        </div>

        {}
        {tickerAlert && (
          <div className="hidden md:flex flex-1 mx-4 items-center gap-2 bg-surface-700 border border-surface-600 rounded-lg px-3 py-1.5 overflow-hidden max-w-sm">
            {alertTypeIcon(tickerAlert.alert_type)}
            <span className="text-xs text-slate-300 truncate flex-1">
              {tickerAlert.device_id} – {tickerAlert.alert_type}
            </span>
            <Badge className={cn('text-[10px] shrink-0', severityBg(tickerAlert.severity))}>
              {tickerAlert.severity}
            </Badge>
          </div>
        )}

        {}
        <div className="flex items-center gap-2 shrink-0">
          {}
          <div className="relative hidden md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search events…"
              className="pl-9 w-52 h-9 text-sm bg-surface-700 border-surface-600"
            />
          </div>

          {}
          <button
            onClick={() => setSearchOpen(v => !v)}
            className="md:hidden p-2 rounded-xl bg-surface-700 border border-surface-600 text-slate-400 hover:text-white transition-colors"
          >
            {searchOpen ? <X size={16} /> : <Search size={16} />}
          </button>

          {}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-xl bg-surface-700 border border-surface-600 text-slate-400 hover:text-white transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {}
          <Popover>
            <PopoverTrigger asChild>
              <button className="relative p-2 rounded-xl bg-surface-700 border border-surface-600 text-slate-400 hover:text-white transition-colors">
                <Bell size={18} />
                {openAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {openAlerts > 9 ? '9+' : openAlerts}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Notifications</p>
                <Badge variant="secondary" className="text-xs">{openAlerts} open</Badge>
              </div>
              <Separator />
              <ScrollArea className="max-h-64">
                {recentAlerts.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">No open alerts</p>
                ) : recentAlerts.map(a => (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-600 transition-colors">
                    <div className="mt-0.5 shrink-0">{alertTypeIcon(a.alert_type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{a.device_id} – {a.alert_type}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{a.timestamp?.split('T')[0] || a.timestamp}</p>
                    </div>
                    <Badge className={cn('text-[10px] shrink-0 mt-0.5', severityBg(a.severity))}>
                      {a.severity}
                    </Badge>
                  </div>
                ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <Input
              autoFocus
              type="text"
              placeholder="Search sensor / event…"
              className="pl-9 w-full h-10 text-sm bg-surface-700 border-surface-600"
            />
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
