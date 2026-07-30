import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Network, Plug, Zap, FileText, Database, User, LogOut, ShieldCheck } from 'lucide-react';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';

import Splash from './pages/Splash';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MemoryGraph from './pages/MemoryGraph';
import AIAdapters from './pages/AIAdapters';
import DataSources from './pages/DataSources';
import Subscription from './pages/Subscription';
import BusinessDocs from './pages/BusinessDocs';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';

import './App.css';

const NAV_LINKS = [
  { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { to: '/graph', icon: <Network size={20} />, label: 'Memory Graph' },
  { to: '/sources', icon: <Database size={20} />, label: 'Data Sources' },
  { to: '/adapters', icon: <Plug size={20} />, label: 'AI Adapters' },
  { to: '/subscription', icon: <Zap size={20} />, label: 'Subscription' },
  { to: '/docs', icon: <FileText size={20} />, label: 'Business Docs' },
];

const HIDE_SIDEBAR = ['/', '/onboarding', '/login', '/privacy', '/terms'];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isDemo } = useAuth();

  if (HIDE_SIDEBAR.includes(location.pathname)) return null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initial = displayName[0]?.toUpperCase() || 'U';

  return (
    <div className="sidebar glass-card">
      <div className="sidebar-logo">
        <h2 className="gradient-text">AXON</h2>
        {isDemo && (
          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px', letterSpacing: '1px' }}>
            DEMO MODE
          </div>
        )}
      </div>
      <nav className="sidebar-nav">
        {NAV_LINKS.map((link) => (
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
          <div className="avatar" style={{ background: 'linear-gradient(135deg, var(--color-neon-cyan), var(--color-neon-purple))', color: '#000', fontWeight: 700, fontSize: '14px' }}>
            {initial}
          </div>
          <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
            <span className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '120px' }}>{displayName}</span>
            <span className="plan gradient-text">Pro Plan</span>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <LogOut size={15} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <Link to="/privacy" style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>Privacy</Link>
          <span style={{ fontSize: '10px', color: 'var(--color-border)' }}>·</span>
          <Link to="/terms" style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>Terms</Link>
        </div>
      </div>
    </div>
  );
}

function AppLayout() {
  return (
    <BrowserRouter>
      <div className="grid-bg" />
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <ErrorBoundary>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Splash />} />
              <Route path="/login" element={<Login />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />

              {/* Protected */}
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/graph" element={<ProtectedRoute><MemoryGraph /></ProtectedRoute>} />
              <Route path="/sources" element={<ProtectedRoute><DataSources /></ProtectedRoute>} />
              <Route path="/adapters" element={<ProtectedRoute><AIAdapters /></ProtectedRoute>} />
              <Route path="/subscription" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
              <Route path="/docs" element={<ProtectedRoute><BusinessDocs /></ProtectedRoute>} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  );
}
