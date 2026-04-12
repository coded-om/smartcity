import React from 'react';
import { FiGrid, FiRadio, FiFileText, FiCpu, FiVideo, FiSettings, FiX } from 'react-icons/fi';
import { BsShieldFill } from 'react-icons/bs';

const NAV_ITEMS = [
  { id: 'overview',      icon: FiGrid,     label: 'Overview'      },
  { id: 'live-monitor',  icon: FiRadio,    label: 'Live Monitor'  },
  { id: 'forensic-logs', icon: FiFileText, label: 'Forensic Logs' },
  { id: 'ai-analysis',   icon: FiCpu,      label: 'AI Analysis'   },
  { id: 'camera-events', icon: FiVideo,    label: 'Camera Events' },
  { id: 'settings',      icon: FiSettings, label: 'Settings'      },
];

// --- Sub-components ----------------------------------------------------------

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
          : 'text-slate-400 hover:bg-[#1e2535] hover:text-white'
      }`}
    >
      <Icon className="text-base shrink-0" />
      {item.label}
    </button>
  );
}

function DeviceRow({ device }) {
  const isActive = device.status === 'active';
  return (
    <div className="flex justify-between items-center px-2 py-2 rounded-lg hover:bg-[#1e2535]">
      <div>
        <p className="text-xs font-medium text-slate-300">{device.device_id}</p>
        <p className="text-[10px] text-slate-600">{device.location || 'Unknown'}</p>
      </div>
      <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </div>
  );
}

// --- Main component ----------------------------------------------------------

function Sidebar({ activeView, setActiveView, stats, devices, isOpen, onClose }) {
  const totalDevices  = stats?.devices_total  || 0;
  const onlineDevices = stats?.devices_online || 0;
  const totalAlerts   = stats?.total_alerts   || 0;
  const openAlerts    = stats?.open_alerts    || 0;

  const onlinePercent = totalDevices > 0
    ? `${(onlineDevices / totalDevices) * 100}%`
    : '0%';

  return (
    <aside className={`
      flex flex-col w-64 bg-[#161b27] border-r border-[#252d3d] shrink-0
      fixed inset-y-0 left-0 z-30 transition-transform duration-300
      lg:translate-x-0 lg:relative lg:z-auto
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>

      {/* Logo + Close button */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#252d3d]">
        <BsShieldFill className="text-blue-500 text-2xl shrink-0" />
        <div className="flex-1">
          <h1 className="text-white font-bold text-sm leading-tight">Smart City Forensics</h1>
          <p className="text-slate-500 text-xs">IoT Security Dashboard</p>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-[#1e2535] transition-colors"
          aria-label="Close sidebar"
        >
          <FiX className="text-lg" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest px-2 mb-3">
          Navigation
        </p>
        {NAV_ITEMS.map(item => (
          <NavItem
            key={item.id}
            item={item}
            active={activeView === item.id}
            onClick={() => setActiveView(item.id)}
          />
        ))}
      </nav>

      {/* Live Status */}
      <div className="px-4 pb-4 space-y-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
          Live Status
        </p>

        <div className="rounded-xl bg-[#1e2535] p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Devices</span>
            <span className={`text-xs font-bold ${onlineDevices > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {onlineDevices}/{totalDevices} online
            </span>
          </div>
          <div className="w-full bg-[#252d3d] rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all"
              style={{ width: onlinePercent }}
            />
          </div>
        </div>

        <div className="rounded-xl bg-[#1e2535] p-3 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Alerts</span>
            <span className={`text-xs font-bold ${openAlerts > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
              {openAlerts} open
            </span>
          </div>
          <p className="text-slate-400 text-xs">{totalAlerts} total recorded</p>
        </div>

        {devices?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Devices</p>
            {devices.map(d => (
              <DeviceRow key={d.device_id} device={d} />
            ))}
          </div>
        )}
      </div>

    </aside>
  );
}

export default Sidebar;
