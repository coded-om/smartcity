import React, { useState } from 'react';
import {
  LayoutDashboard, Radio, Camera, Map, Cpu, FileText,
  Printer, Settings, Shield, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Separator } from './ui/separator';
import { Sheet, SheetContent } from './ui/sheet';

const NAV_GROUPS = [
  {
    label: 'Monitoring',
    items: [
      { id: 'overview',      icon: LayoutDashboard, label: 'Overview'      },
      { id: 'live-monitor',  icon: Radio,           label: 'Live Monitor'  },
      { id: 'cameras',       icon: Camera,          label: 'Cameras'       },
      { id: 'security-map',  icon: Map,             label: 'Security Map'  },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'ai-analysis',   icon: Cpu,      label: 'AI Analysis'   },
      { id: 'forensic-logs', icon: FileText, label: 'Forensic Logs' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { id: 'report-center', icon: Printer, label: 'Report Center' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'settings', icon: Settings, label: 'Settings' },
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
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border',
        active
          ? 'bg-primary-500/25 text-primary-200 border-primary-500/40 shadow-glow-primary'
          : 'text-slate-400 hover:bg-surface-600 hover:text-slate-200 border-transparent',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon size={16} className="shrink-0" />
      {!collapsed && <span className="truncate leading-none">{item.label}</span>}
      {active && !collapsed && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
      )}
    </button>
  );
}

function DeviceRow({ device }) {
  const online = device.online ?? device.status === 'online';
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-600 transition-colors group">
      <span className={cn(
        'w-2 h-2 rounded-full shrink-0',
        online ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]' : 'bg-accent-500',
      )} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-300 truncate group-hover:text-white transition-colors">{device.device_id}</p>
        <p className="text-[10px] text-slate-600 truncate">{device.location || 'Unknown'}</p>
      </div>
    </div>
  );
}

function SidebarInner({ activeView, setActiveView, stats, devices, collapsed, setCollapsed, onClose }) {
  const openAlerts    = stats?.open_alerts    || 0;
  const onlineDevices = stats?.devices_online || 0;
  const totalDevices  = stats?.devices_total  || 0;

  return (
    <div className="flex flex-col h-full bg-surface-900">
      {}
      <div className={cn(
        'flex items-center gap-3 px-4 py-4 border-b border-surface-700',
        collapsed && 'justify-center px-2',
      )}>
        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-primary-500/20 border border-primary-500/30">
          <Shield size={16} className="text-primary-300" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-sm leading-tight truncate">SmartCity</h1>
            <p className="text-slate-500 text-[11px] leading-tight">IoT Security Platform</p>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="lg:hidden ml-auto p-1 rounded-md text-slate-500 hover:text-white hover:bg-surface-700 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 flex gap-2">
          <div className={cn(
            'flex-1 rounded-lg p-2 text-center border',
            openAlerts > 0 ? 'bg-accent-500/10 border-accent-500/30' : 'bg-surface-700 border-surface-600',
          )}>
            <p className={cn('text-base font-bold tabular-nums', openAlerts > 0 ? 'text-accent-300' : 'text-emerald-400')}>
              {openAlerts}
            </p>
            <p className="text-[9px] text-slate-500 uppercase tracking-wide">Alerts</p>
          </div>
          <div className="flex-1 bg-surface-700 border border-surface-600 rounded-lg p-2 text-center">
            <p className="text-base font-bold tabular-nums text-primary-300">{onlineDevices}/{totalDevices}</p>
            <p className="text-[9px] text-slate-500 uppercase tracking-wide">Online</p>
          </div>
        </div>
      )}

      {}
      <nav className="flex-1 px-2 py-3 space-y-3 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && !collapsed && <Separator className="mb-3" />}
            {!collapsed && (
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavItem
                  key={item.id}
                  item={item}
                  active={activeView === item.id}
                  onClick={() => { setActiveView(item.id); onClose?.(); }}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {}
      {!collapsed && devices && devices.length > 0 && (
        <div className="border-t border-surface-700 px-3 pt-3 pb-2">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-1 mb-2">IoT Devices</p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {devices.map(d => <DeviceRow key={d.device_id} device={d} />)}
          </div>
        </div>
      )}

      {}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="hidden lg:flex items-center justify-center p-3 border-t border-surface-700 text-slate-500 hover:text-white hover:bg-surface-700 transition-colors"
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}

function Sidebar({ activeView, setActiveView, stats, devices, isOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {}
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="left" className="p-0 w-64 border-surface-700">
          <SidebarInner
            activeView={activeView}
            setActiveView={setActiveView}
            stats={stats}
            devices={devices}
            collapsed={false}
            setCollapsed={() => {}}
            onClose={onClose}
          />
        </SheetContent>
      </Sheet>

      {}
      <aside className={cn(
        'hidden lg:flex flex-col shrink-0 border-r border-surface-700 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}>
        <SidebarInner
          activeView={activeView}
          setActiveView={setActiveView}
          stats={stats}
          devices={devices}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onClose={null}
        />
      </aside>
    </>
  );
}

export default Sidebar;
