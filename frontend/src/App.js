import React, { useState, useEffect } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

import Sidebar      from './components/Sidebar';
import Header       from './components/Header';
import Overview     from './components/Overview';
import LiveMonitor  from './components/LiveMonitor';
import ForensicLogs from './components/ForensicLogs';
import AIAnalysis   from './components/AIAnalysis';
import './App.css';

const API_URL = `http://${window.location.hostname}:5000/api`;
const POLL_MS = 3000;

function fetchWithSignal(url, signal) {
  return fetch(url, { signal });
}

function App() {
  const [activeView,    setActiveView]    = useState('overview');
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [stats,   setStats]   = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts,  setAlerts]  = useState([]);
  const [models,  setModels]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let controller = new AbortController();

    const fetchAll = async () => {
      controller.abort();               // cancel any in-flight requests
      controller = new AbortController();
      const { signal } = controller;

      try {
        const [sRes, dRes, aRes, mRes] = await Promise.all([
          fetchWithSignal(`${API_URL}/stats`,            signal),
          fetchWithSignal(`${API_URL}/devices`,          signal),
          fetchWithSignal(`${API_URL}/alerts?limit=50`,  signal),
          fetchWithSignal(`${API_URL}/models`,           signal),
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
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  const handleNavChange = (view) => {
    setActiveView(view);
    setSidebarOpen(false); // close drawer on mobile after navigation
  };

  const renderView = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
          <FiRefreshCw className="animate-spin text-5xl text-blue-500" />
          <p className="text-lg">Loading system data...</p>
        </div>
      );
    }

    switch (activeView) {
      case 'overview':      return <Overview stats={stats} devices={devices} alerts={alerts} models={models} />;
      case 'live-monitor':  return <LiveMonitor devices={devices} />;
      case 'forensic-logs': return <ForensicLogs alerts={alerts} />;
      case 'ai-analysis':   return <AIAnalysis devices={devices} models={models} alerts={alerts} />;
      default:              return <Overview stats={stats} devices={devices} alerts={alerts} models={models} />;
    }
  };

  return (
    <div className="app">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        activeView={activeView}
        setActiveView={handleNavChange}
        stats={stats}
        devices={devices}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        <Header
          activeView={activeView}
          stats={stats}
          onMenuClick={() => setSidebarOpen(prev => !prev)}
        />
        <div className="content-area">
          {renderView()}
        </div>
      </div>
    </div>
  );
}

export default App;
