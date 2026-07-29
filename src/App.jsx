import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Network, Plug, Zap, FileText, Settings, Key, User, Database } from 'lucide-react';
import Splash from './pages/Splash';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import MemoryGraph from './pages/MemoryGraph';
import AIAdapters from './pages/AIAdapters';
import DataSources from './pages/DataSources';
import Subscription from './pages/Subscription';
import BusinessDocs from './pages/BusinessDocs';
import './App.css';

function Sidebar() {
  const location = useLocation();
  const hideSidebar = ['/', '/onboarding'].includes(location.pathname);

  if (hideSidebar) return null;

  const links = [
    { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/graph', icon: <Network size={20} />, label: 'Memory Graph' },
    { to: '/sources', icon: <Database size={20} />, label: 'Data Sources' },
    { to: '/adapters', icon: <Plug size={20} />, label: 'AI Adapters' },
    { to: '/subscription', icon: <Zap size={20} />, label: 'Subscription' },
    { to: '/docs', icon: <FileText size={20} />, label: 'Business Docs' },
  ];

  return (
    <div className="sidebar glass-card">
      <div className="sidebar-logo">
        <h2 className="gradient-text">AXON</h2>
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
           <Link 
            key={link.to} 
            to={link.to} 
            className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
          >
            {link.icon}
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar"><User size={16}/></div>
          <div className="user-info">
            <span className="name">User</span>
            <span className="plan gradient-text">Pro Plan</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="grid-bg"></div>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Splash />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/graph" element={<MemoryGraph />} />
            <Route path="/sources" element={<DataSources />} />
            <Route path="/adapters" element={<AIAdapters />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/docs" element={<BusinessDocs />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
