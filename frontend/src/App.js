import React, { useState, useEffect, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { Toaster } from 'sonner';

import createAppTheme from './theme';
import Sidebar        from './components/Sidebar';
import Header         from './components/Header';
import Overview       from './components/Overview';
import LiveMonitor    from './components/LiveMonitor';
import Cameras        from './components/Cameras';
import ForensicLogs   from './components/ForensicLogs';
import AIAnalysis     from './components/AIAnalysis';
import SecurityMap    from './components/SecurityMap';
import ReportCenter   from './components/ReportCenter';
import Settings       from './components/Settings';
import ThreatMonitor  from './components/ThreatMonitor';
import { apiFetch }   from './apiBase';

const POLL_MS   = 8000;
const APP_BAR_H = 64;  // px — matches MUI Toolbar default height
const RAIL_W    = 80;  // px — Navigation Rail width on desktop

function fetchWithSignal(path, signal) {
  return apiFetch(path, { signal });
}

function App() {
  const [activeView,  setActiveView]  = useState('overview');
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [stats,   setStats]   = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts,  setAlerts]  = useState([]);
  const [models,  setModels]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem('theme') || 'light'
  );

  // Build MUI theme — re-memoized when mode toggles
  const muiTheme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  // Keep html.dark class in sync (for any residual Tailwind dark: classes)
  useEffect(() => {
    const html = document.documentElement;
    if (themeMode === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');
    localStorage.setItem('theme', themeMode);
  }, [themeMode]);

  const toggleTheme = () => setThemeMode(m => m === 'dark' ? 'light' : 'dark');

  // ── Data polling ──────────────────────────────────────────
  useEffect(() => {
    let controller = new AbortController();

    const fetchAll = async () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      try {
        const [sRes, dRes, aRes, mRes] = await Promise.all([
          fetchWithSignal('/stats',           signal),
          fetchWithSignal('/devices',         signal),
          fetchWithSignal('/alerts?limit=50', signal),
          fetchWithSignal('/models',          signal),
        ]);
        const [sData, dData, aData, mData] = await Promise.all([
          sRes.json(), dRes.json(), aRes.json(), mRes.json(),
        ]);
        setStats(sData.data);
        setDevices(dData.data || []);
        setAlerts(aData.data  || []);
        setModels(mData.data?.trained_models || []);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, POLL_MS);
    return () => { clearInterval(interval); controller.abort(); };
  }, []);

  const handleNavChange = (view) => {
    setActiveView(view);
    setMobileOpen(false);
  };

  // ── View renderer ─────────────────────────────────────────
  const renderView = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 2 }}>
          <CircularProgress size={48} />
          <Typography variant="body1" color="text.secondary">Loading system data…</Typography>
        </Box>
      );
    }
    switch (activeView) {
      case 'overview':      return <Overview      stats={stats} devices={devices} alerts={alerts} models={models} />;
      case 'live-monitor':  return <LiveMonitor   devices={devices} />;
      case 'cameras':       return <Cameras />;
      case 'forensic-logs': return <ForensicLogs  alerts={alerts} />;
      case 'ai-analysis':   return <AIAnalysis    devices={devices} models={models} alerts={alerts} />;
      case 'security-map':  return <SecurityMap   devices={devices} alerts={alerts} />;
      case 'report-center': return <ReportCenter  devices={devices} alerts={alerts} stats={stats} models={models} />;
      case 'settings':      return <Settings />;
      default:              return <Overview      stats={stats} devices={devices} alerts={alerts} models={models} />;
    }
  };

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Toaster richColors position="top-right" />

      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
        {/* ── Top App Bar ─────────────────────────────────── */}
        <Header
          activeView={activeView}
          stats={stats}
          alerts={alerts}
          onMenuClick={() => setMobileOpen(p => !p)}
          themeMode={themeMode}
          toggleTheme={toggleTheme}
          appBarHeight={APP_BAR_H}
        />

        {/* ── Navigation Sidebar (Rail + Drawer) ──────────── */}
        <Sidebar
          activeView={activeView}
          setActiveView={handleNavChange}
          stats={stats}
          devices={devices}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          railWidth={RAIL_W}
          appBarHeight={APP_BAR_H}
        />

        {/* ── Main Content ────────────────────────────────── */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            mt: `${APP_BAR_H}px`,
            ml: { xs: 0, md: `${RAIL_W}px` },
            width: { xs: '100%', md: `calc(100% - ${RAIL_W}px)` },
          }}
        >
          {/* Threat monitor strip */}
          <ThreatMonitor onViewCamera={() => handleNavChange('cameras')} />

          {/* Scrollable view area */}
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 2, sm: 3 } }}>
            {renderView()}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;

