import React, { useState, useEffect } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import { Bell, Search, Wifi, WifiOff, Menu, Sun, Moon, Flame, Wind, Zap, AlertTriangle, Activity } from 'lucide-react';
import { formatRelative } from '../lib/utils';

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

const SEVERITY_COLOR = { CRITICAL: 'error', HIGH: 'warning', MEDIUM: 'info', LOW: 'default' };

function alertIcon(type) {
  const sz = 14;
  switch (type) {
    case 'FIRE':       return <Flame      size={sz} color="#ef4444" />;
    case 'GAS_LEAK':   return <Wind       size={sz} color="#f59e0b" />;
    case 'EXPLOSION':  return <Zap        size={sz} color="#f97316" />;
    case 'INTRUDER':   return <AlertTriangle size={sz} color="#3b82f6" />;
    default:           return <Activity   size={sz} color="#6366f1" />;
  }
}

function Header({ activeView, stats, alerts, onMenuClick, themeMode, toggleTheme, appBarHeight }) {
  const theme          = useTheme();
  const [searchOpen,   setSearchOpen]  = useState(false);
  const [anchorEl,     setAnchorEl]    = useState(null);
  const [tickerIdx,    setTickerIdx]   = useState(0);

  const openAlerts    = stats?.open_alerts    || 0;
  const totalReadings = stats?.total_readings || 0;
  const isConnected   = (stats?.devices_online || 0) > 0;
  const recentAlerts  = (alerts || []).filter(a => !a.resolved).slice(0, 12);
  const tickerAlert   = recentAlerts[tickerIdx];

  useEffect(() => {
    if (recentAlerts.length < 2) return;
    const t = setInterval(() => setTickerIdx(i => (i + 1) % recentAlerts.length), 4000);
    return () => clearInterval(t);
  }, [recentAlerts.length]);

  const searchBg = alpha(theme.palette.text.primary, 0.06);

  return (
    <AppBar
      position="fixed"
      sx={{
        zIndex: t => t.zIndex.drawer + 1,
        height: appBarHeight,
        bgcolor: 'background.paper',
      }}
    >
      <Toolbar sx={{ height: appBarHeight, minHeight: `${appBarHeight}px !important`, px: { xs: 1.5, sm: 2 }, gap: 1 }}>

        {/* Menu button (mobile only) */}
        <IconButton onClick={onMenuClick} size="small" sx={{ display: { md: 'none' } }}>
          <Menu size={20} />
        </IconButton>

        {/* Logo + Page title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flexShrink: 0 }}>
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              width: 32, height: 32, borderRadius: '10px',
              bgcolor: 'primary.main', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.8rem' }}>SC</Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap fontWeight={600} fontSize="0.9375rem">
              {TITLES[activeView] || 'Overview'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: '-2px' }}>
              {isConnected
                ? <Wifi size={10} color={theme.palette.success.main} />
                : <WifiOff size={10} color={theme.palette.error.main} />}
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {isConnected ? 'Live' : 'Offline'} · {totalReadings.toLocaleString()} readings
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Alert ticker (center, desktop only) */}
        {tickerAlert && (
          <Box
            sx={{
              display: { xs: 'none', lg: 'flex' },
              flex: 1, mx: 2, alignItems: 'center', gap: 1,
              bgcolor: searchBg, borderRadius: 2, px: 1.5, py: 0.75,
              maxWidth: 400,
            }}
          >
            {alertIcon(tickerAlert.alert_type)}
            <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: '0.75rem' }}>
              {tickerAlert.device_id} — {tickerAlert.alert_type}
            </Typography>
            <Chip
              label={tickerAlert.severity}
              color={SEVERITY_COLOR[tickerAlert.severity] || 'default'}
              size="small"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
            />
          </Box>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Search bar (desktop) */}
        {!searchOpen ? (
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center', gap: 1,
              bgcolor: searchBg, borderRadius: 2,
              px: 1.5, py: 0.5, cursor: 'text',
            }}
            onClick={() => setSearchOpen(true)}
          >
            <Search size={14} color={theme.palette.text.secondary} />
            <Typography variant="caption" color="text.secondary">Search events…</Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              bgcolor: searchBg, borderRadius: 2, px: 1.5, py: 0.25,
              width: { xs: 160, sm: 220 },
            }}
          >
            <Search size={14} color={theme.palette.text.secondary} />
            <InputBase
              autoFocus
              placeholder="Search events…"
              onBlur={() => setSearchOpen(false)}
              sx={{ fontSize: '0.8125rem', flex: 1, height: 28 }}
            />
          </Box>
        )}

        {/* Search icon (mobile) */}
        <IconButton
          size="small"
          onClick={() => setSearchOpen(s => !s)}
          sx={{ display: { xs: 'flex', md: 'none' } }}
        >
          <Search size={18} />
        </IconButton>

        {/* Theme toggle */}
        <Tooltip title={themeMode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton size="small" onClick={toggleTheme}>
            {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
        </Tooltip>

        {/* Notifications */}
        <Tooltip title="Notifications">
          <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)}>
            <Badge badgeContent={openAlerts > 0 ? (openAlerts > 99 ? '99+' : openAlerts) : null} color="error">
              <Bell size={20} />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* Notifications popover */}
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { width: 320, mt: 1, borderRadius: 3 } }}
        >
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" fontWeight={600}>Notifications</Typography>
            <Chip label={`${openAlerts} open`} size="small" color="primary" variant="outlined" />
          </Box>
          <Divider />
          <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
            {recentAlerts.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No open alerts
              </Typography>
            ) : (
              <List dense disablePadding>
                {recentAlerts.map(a => (
                  <ListItem key={a.id} divider sx={{ alignItems: 'flex-start', gap: 1.5, py: 1.25 }}>
                    <Box sx={{ mt: 0.25, flexShrink: 0 }}>{alertIcon(a.alert_type)}</Box>
                    <ListItemText
                      primary={`${a.device_id} — ${a.alert_type}`}
                      secondary={a.timestamp?.split('T')[0] || a.timestamp}
                      primaryTypographyProps={{ variant: 'caption', fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.65rem' } }}
                    />
                    <Chip
                      label={a.severity}
                      color={SEVERITY_COLOR[a.severity] || 'default'}
                      size="small"
                      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, mt: 0.25 }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </Popover>

      </Toolbar>

      {/* Mobile search expansion */}
      {searchOpen && (
        <Box sx={{ px: 2, pb: 1.5, display: { md: 'none' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: searchBg, borderRadius: 2, px: 1.5 }}>
            <Search size={14} color={theme.palette.text.secondary} />
            <InputBase autoFocus placeholder="Search sensor / event…" onBlur={() => setSearchOpen(false)} sx={{ fontSize: '0.8125rem', flex: 1, height: 36 }} />
          </Box>
        </Box>
      )}
    </AppBar>
  );
}

export default Header;

