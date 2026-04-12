import React, { useState } from 'react';
import { FiBell, FiSearch, FiWifi, FiMenu, FiX } from 'react-icons/fi';

const TITLES = {
  'overview':      'Overview',
  'live-monitor':  'Live Monitor',
  'forensic-logs': 'Forensic Logs',
  'ai-analysis':   'AI Analysis',
  'camera-events': 'Camera Events',
  'settings':      'Settings',
};

function Header({ activeView, stats, onMenuClick }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const openAlerts = stats?.open_alerts || 0;

  return (
    <header className="shrink-0 bg-[#161b27] border-b border-[#252d3d]">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 gap-3">

        {/* Left: hamburger (mobile) + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-xl bg-[#1e2535] border border-[#252d3d] text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Open menu"
          >
            <FiMenu className="text-lg" />
          </button>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-lg sm:text-xl truncate">
              {TITLES[activeView] || 'Overview'}
            </h2>
            <div className="hidden sm:flex items-center gap-2 mt-0.5">
              <FiWifi className="text-emerald-400 text-xs shrink-0" />
              <span className="text-slate-500 text-xs">
                Connected · {stats?.total_readings ?? 0} readings
              </span>
            </div>
          </div>
        </div>

        {/* Right: search + bell */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop search */}
          <div className="relative hidden md:block">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-[#1e2535] border border-[#252d3d] text-slate-300 text-sm rounded-xl pl-9 pr-4 py-2 w-56 lg:w-64 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
            />
          </div>

          {/* Mobile search toggle */}
          <button
            onClick={() => setSearchOpen(v => !v)}
            className="md:hidden p-2 rounded-xl bg-[#1e2535] border border-[#252d3d] text-slate-400 hover:text-white transition-colors"
            aria-label="Search"
          >
            {searchOpen ? <FiX className="text-lg" /> : <FiSearch className="text-lg" />}
          </button>

          {/* Bell */}
          <button className="relative p-2 sm:p-2.5 rounded-xl bg-[#1e2535] border border-[#252d3d] text-slate-400 hover:text-white transition-colors">
            <FiBell className="text-lg" />
            {openAlerts > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {openAlerts > 9 ? '9+' : openAlerts}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile search bar (expandable) */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
            <input
              autoFocus
              type="text"
              placeholder="Search sensor / event / case..."
              className="w-full bg-[#1e2535] border border-[#252d3d] text-slate-300 text-sm rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
            />
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
