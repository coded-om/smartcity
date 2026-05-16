import React from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  LayoutDashboard, Radio, Camera, Map, Cpu, FileText,
  Printer, Settings, Shield,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Monitoring',
    items: [
      { id: 'overview',      Icon: LayoutDashboard, label: 'Overview' },
      { id: 'live-monitor',  Icon: Radio,           label: 'Monitor'  },
      { id: 'cameras',       Icon: Camera,          label: 'Cameras'  },
      { id: 'security-map',  Icon: Map,             label: 'Map'      },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'ai-analysis',   Icon: Cpu,      label: 'AI Analysis' },
      { id: 'forensic-logs', Icon: FileText, label: 'Forensics'   },
    ],
  },
  {
    label: 'Reports',
    items: [{ id: 'report-center', Icon: Printer, label: 'Reports' }],
  },
  {
    label: 'System',
    items: [{ id: 'settings', Icon: Settings, label: 'Settings' }],
  },
];

// ─── Rail item (80px desktop) ────────────────────────────────────────────────
function RailItem({ item, active, onClick }) {
  const theme = useTheme();
  const { Icon } = item;
  return (
    <Tooltip title={item.label} placement="right" arrow>
      <Box
        onClick={onClick}
        sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 0.5, cursor: 'pointer', py: 0.75, width: '100%', userSelect: 'none',
        }}
      >
        <Box
          sx={{
            width: 56, height: 32, borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: active ? alpha(theme.palette.primary.main, 0.16) : 'transparent',
            color:   active ? 'primary.main' : 'text.secondary',
            transition: 'background-color 0.2s, color 0.2s',
            '&:hover': {
              bgcolor: active
                ? alpha(theme.palette.primary.main, 0.24)
                : alpha(theme.palette.text.primary, 0.08),
            },
          }}
        >
          <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
        </Box>
        <Typography variant="caption" sx={{
          fontSize: '0.625rem', fontWeight: active ? 600 : 400,
          color: active ? 'primary.main' : 'text.secondary',
          lineHeight: 1.2, textAlign: 'center',
        }}>
          {item.label}
        </Typography>
      </Box>
    </Tooltip>
  );
}

// ─── Drawer item (280px mobile) ───────────────────────────────────────────────
function DrawerItem({ item, active, onClick }) {
  const { Icon } = item;
  return (
    <ListItemButton selected={active} onClick={onClick} sx={{ mb: 0.5 }}>
      <ListItemIcon sx={{ minWidth: 36, color: active ? 'primary.main' : 'text.secondary' }}>
        <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
      </ListItemIcon>
      <ListItemText
        primary={item.label}
        primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 600 : 400, color: active ? 'primary.main' : 'text.primary' }}
      />
      {active && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main', ml: 1 }} />}
    </ListItemButton>
  );
}

// ─── Rail content ─────────────────────────────────────────────────────────────
function RailContent({ activeView, onNavigate, stats }) {
  const openAlerts    = stats?.open_alerts    || 0;
  const onlineDevices = stats?.devices_online || 0;
  const totalDevices  = stats?.devices_total  || 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', py: 1.5 }}>
      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={20} color="#fff" />
        </Box>
      </Box>
      {openAlerts > 0 && (
        <Chip label={openAlerts} color="error" size="small" sx={{ mb: 1, height: 20, fontSize: '0.625rem', fontWeight: 700 }} />
      )}
      <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', mb: 2 }}>
        {onlineDevices}/{totalDevices}
      </Typography>
      <Divider sx={{ width: 40, mb: 1.5 }} />
      <Box sx={{ flex: 1, overflow: 'hidden auto', width: '100%', px: 0.5 }}>
        {NAV_GROUPS.map((group, gi) => (
          <React.Fragment key={group.label}>
            {gi > 0 && <Divider sx={{ width: 40, mx: 'auto', my: 1 }} />}
            {group.items.map(item => (
              <RailItem key={item.id} item={item} active={activeView === item.id} onClick={() => onNavigate(item.id)} />
            ))}
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
}

// ─── Drawer content ───────────────────────────────────────────────────────────
function DrawerContent({ activeView, onNavigate, stats, devices, onClose }) {
  const openAlerts    = stats?.open_alerts    || 0;
  const onlineDevices = stats?.devices_online || 0;
  const totalDevices  = stats?.devices_total  || 0;
  return (
    <Box sx={{ width: 280, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', borderRadius: '12px' }} variant="rounded">
          <Shield size={20} />
        </Avatar>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>SmartCity</Typography>
          <Typography variant="caption" color="text.secondary">IoT Security Platform</Typography>
        </Box>
      </Box>
      <Box sx={{ px: 2, pb: 1, display: 'flex', gap: 1 }}>
        <Box sx={{ flex: 1, p: 1.5, borderRadius: 2, bgcolor: openAlerts > 0 ? 'error.main' : 'action.hover', textAlign: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700} color={openAlerts > 0 ? '#fff' : 'success.main'}>{openAlerts}</Typography>
          <Typography variant="caption" color={openAlerts > 0 ? 'rgba(255,255,255,.8)' : 'text.secondary'} sx={{ fontSize: '0.625rem' }}>Alerts</Typography>
        </Box>
        <Box sx={{ flex: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700} color="primary.main">{onlineDevices}/{totalDevices}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.625rem' }}>Online</Typography>
        </Box>
      </Box>
      <Divider sx={{ mx: 2, mb: 1 }} />
      <Box sx={{ flex: 1, overflow: 'hidden auto', px: 1 }}>
        {NAV_GROUPS.map((group, gi) => (
          <React.Fragment key={group.label}>
            {gi > 0 && <Divider sx={{ my: 1, mx: 1 }} />}
            <Typography variant="overline" sx={{ px: 2, mb: 0.5, display: 'block', color: 'text.disabled', fontSize: '0.6rem', letterSpacing: '0.08rem' }}>
              {group.label}
            </Typography>
            <List dense disablePadding>
              {group.items.map(item => (
                <DrawerItem key={item.id} item={item} active={activeView === item.id} onClick={() => { onNavigate(item.id); onClose(); }} />
              ))}
            </List>
          </React.Fragment>
        ))}
      </Box>
      {devices && devices.length > 0 && (
        <>
          <Divider sx={{ mx: 2, mb: 1 }} />
          <Box sx={{ px: 2, pb: 2 }}>
            <Typography variant="overline" sx={{ color: 'text.disabled', fontSize: '0.6rem', letterSpacing: '0.08rem' }}>IoT Devices</Typography>
            <Box sx={{ mt: 0.5, maxHeight: 100, overflow: 'hidden auto' }}>
              {devices.slice(0, 10).map(d => {
                const online = d.online ?? d.status === 'online';
                return (
                  <Box key={d.device_id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, px: 1, borderRadius: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: online ? 'success.main' : 'error.main', flexShrink: 0 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" noWrap fontWeight={500}>{d.device_id}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.6rem' }}>{d.location || 'Unknown'}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ activeView, setActiveView, stats, devices, mobileOpen, onClose, railWidth, appBarHeight }) {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: 280, boxSizing: 'border-box',
            top: `${appBarHeight}px`, height: `calc(100vh - ${appBarHeight}px)`,
          },
        }}
      >
        <DrawerContent activeView={activeView} onNavigate={setActiveView} stats={stats} devices={devices} onClose={onClose} />
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: railWidth, flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: railWidth, boxSizing: 'border-box',
          top: `${appBarHeight}px`, height: `calc(100vh - ${appBarHeight}px)`,
          overflow: 'hidden', border: 'none',
          borderRight: `1px solid ${theme.palette.divider}`,
        },
      }}
    >
      <RailContent activeView={activeView} onNavigate={setActiveView} stats={stats} />
    </Drawer>
  );
}

export default Sidebar;

