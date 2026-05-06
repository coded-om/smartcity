import React, { useState } from 'react';
import {
  FiGrid, FiRadio, FiFileText, FiCpu, FiMap, FiPrinter,
  FiX, FiChevronLeft, FiChevronRight, FiShield, FiCamera, FiSettings,
} from 'react-icons/fi';
import { BsShieldFill } from 'react-icons/bs';
import { cn } from '../lib/utils';

const NAV_GROUPS = [
  {
    label: 'Monitoring',
    items: [
      { id: 'overview',      icon: FiGrid,     label: 'Overview'      },
      { id: 'live-monitor',  icon: FiRadio,    label: 'Live Monitor'  },
      { id: 'cameras',       icon: FiCamera,   label: 'Cameras'       },
      { id: 'security-map',  icon: FiMap,      label: 'Security Map'  },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'ai-analysis',   icon: FiCpu,      label: 'AI Analysis'   },
      { id: 'forensic-logs', icon: FiFileText, label: 'Forensic Logs' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { id: 'report-center', icon: FiPrinter,  label: 'Report Center' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'settings',      icon: FiSettings, label: 'Settings'      },
    ],
  },
];

function NavItem({ item, active, onClick, collapsed }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
        active
          ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30 shadow-glow-cyan'
          : 'text-slate-400 hover:bg-surface-600 hover:text-white',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon className="text-base shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {active && !collapsed && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
      )}
    </button>
  );
}

function DeviceRow({ device }) {
  const online = device.online;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-600 transition-colors">
      <span className={cn(
        'w-2 h-2 rounded-full shrink-0',
        online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-500',
      )} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-300 truncate">{device.device_id}</p>
        <p className="text-[10px] text-slate-600 truncate">{device.location || 'Unknown'}</p>
      </div>
    </div>
  );
}

function Sidebar({ activeView, setActiveView, stats, devices, isOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(false);

  const openAlerts    = stats?.open_alerts    || 0;
  const onlineDevices = stats?.devices_online || 0;
  const totalDevices  = stats?.devices_total  || 0;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        'flex flex-col bg-surface-800 border-r border-surface-600 shrink-0',
        'fixed inset-y-0 left-0 z-30 transition-all duration-300',
        'lg:relative lg:z-auto lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        collapsed ? 'w-16' : 'w-64',
      )}>

        {/* Logo */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-5 border-b border-surface-600',
          collapsed && 'justify-center px-2',
        )}>
          <BsShieldFill className="text-primary-400 text-2xl shrink-0" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-bold text-sm leading-tight truncate">SmartCity Security</h1>
              <p className="text-slate-500 text-xs">IoT Forensics Platform</p>
            </div>
          )}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-600 transition-colors"
          >
            <FiX />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-2 mb-2">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavItem
                    key={item.id}
                    item={item}
                    active={activeView === item.id}
                    onClick={() => { setActiveView(item.id); onClose(); }}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Device list (only when expanded) */}
        {!collapsed && devices && devices.length > 0 && (
          <div className="px-3 pb-3 border-t border-surface-600 pt-3">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-1 mb-2">
              Devices
            </p>
            <div className="space-y-0.5 max-h-36 overflow-y-auto">
              {devices.map(d => <DeviceRow key={d.device_id} device={d} />)}
            </div>
          </div>
        )}

        {/* Status bar */}
        {!collapsed && (
          <div className="px-3 pb-3 border-t border-surface-600 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface-700 rounded-lg p-2 text-center">
                <p className={cn('text-lg font-bold', openAlerts > 0 ? 'text-red-400' : 'text-green-400')}>
                  {openAlerts}
                </p>
                <p className="text-[10px] text-slate-500">Open Alerts</p>
              </div>
              <div className="bg-surface-700 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-primary-400">{onlineDevices}/{totalDevices}</p>
                <p className="text-[10px] text-slate-500">Online</p>
              </div>
            </div>
          </div>
        )}

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex items-center justify-center p-3 border-t border-surface-600 text-slate-500 hover:text-white hover:bg-surface-600 transition-colors"
        >
          {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
        </button>
      </aside>
    </>
  );
}

export default Sidebar;
