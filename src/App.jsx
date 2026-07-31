import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Network, Plug, Zap, FileText, Database, LogOut, X, Menu, ChevronRight, Crown } from 'lucide-react';

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
  { to: '/dashboard', icon: <LayoutDashboard size={20} />, iconSm: <LayoutDashboard size={22} />, label: 'Dashboard', shortLabel: 'Home' },
  { to: '/graph',     icon: <Network size={20} />,         iconSm: <Network size={22} />,         label: 'Memory Graph', shortLabel: 'Graph' },
  { to: '/sources',   icon: <Database size={20} />,        iconSm: <Database size={22} />,        label: 'Data Sources', shortLabel: 'Sources' },
  { to: '/adapters',  icon: <Plug size={20} />,            iconSm: <Plug size={22} />,            label: 'AI Adapters',  shortLabel: 'Adapters' },
];

const MORE_LINKS = [
  { to: '/subscription', icon: <Zap size={20} />,      label: 'Subscription' },
  { to: '/docs',         icon: <FileText size={20} />, label: 'Business Docs' },
];

const HIDE_NAV = ['/', '/onboarding', '/login', '/privacy', '/terms'];

function usePage() {
  const location = useLocation();
  const allLinks = [...NAV_LINKS, ...MORE_LINKS];
  return allLinks.find(l => l.to === location.pathname)?.label || '';
}

/* ───────────── Desktop Sidebar ───────────── */
function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isDemo } = useAuth();

  if (HIDE_NAV.includes(location.pathname)) return null;

  const handleSignOut = async () => { await signOut(); navigate('/login'); };
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initial = displayName[0]?.toUpperCase() || 'U';

  return (
    <div className="sidebar glass-card">
      <div className="sidebar-logo">
        <h2 className="gradient-text">AXON</h2>
        {isDemo && <div className="demo-badge">DEMO MODE</div>}
      </div>
      <nav className="sidebar-nav">
        {[...NAV_LINKS, ...MORE_LINKS].map((link) => (
          <Link key={link.to} to={link.to}
            className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}>
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
            <span className="name">{displayName}</span>
            <span className="plan gradient-text">Pro Plan</span>
          </div>
          <button onClick={handleSignOut} title="Sign out" className="signout-btn">
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

/* ───────────── Mobile Header ───────────── */
function MobileHeader({ onMoreOpen }) {
  const location = useLocation();
  const { isDemo } = useAuth();
  const pageLabel = usePage();

  if (HIDE_NAV.includes(location.pathname)) return null;

  return (
    <header className="mobile-header">
      <div className="mobile-header-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/app-icon-1024.png" alt="AXON" style={{ width: 28, height: 28, borderRadius: 7 }} />
          <span className="gradient-text" style={{ fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>AXON</span>
          {isDemo && <span className="demo-chip">DEMO</span>}
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
          {pageLabel}
        </div>
        <button className="icon-btn" onClick={onMoreOpen} aria-label="More options">
          <Menu size={22} />
        </button>
      </div>
    </header>
  );
}

/* ───────────── Mobile Bottom Tab Bar ───────────── */
function MobileTabBar() {
  const location = useLocation();
  if (HIDE_NAV.includes(location.pathname)) return null;

  return (
    <nav className="mobile-tab-bar">
      {NAV_LINKS.map((link) => {
        const active = location.pathname === link.to;
        return (
          <Link key={link.to} to={link.to} className={`tab-item ${active ? 'active' : ''}`}>
            {link.iconSm}
            <span className="tab-label">{link.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ───────────── Mobile More Drawer ───────────── */
function MobileMoreDrawer({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user, signOut, isDemo } = useAuth();

  if (!isOpen) return null;

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initial = displayName[0]?.toUpperCase() || 'U';

  const handleSignOut = async () => {
    onClose();
    await signOut();
    navigate('/login');
  };

  return (
    <>
      {/* Backdrop */}
      <div className="drawer-backdrop" onClick={onClose} />
      {/* Drawer */}
      <div className="mobile-drawer">
        <div className="drawer-handle" />

        {/* User row */}
        <div className="drawer-user">
          <div className="avatar" style={{ width: 44, height: 44, background: 'linear-gradient(135deg, var(--color-neon-cyan), var(--color-neon-purple))', color: '#000', fontWeight: 700, fontSize: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initial}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{displayName}</div>
            <div className="gradient-text" style={{ fontSize: 12, fontWeight: 600 }}>Pro Plan</div>
          </div>
        </div>

        <div className="drawer-divider" />

        {/* More nav links */}
        {MORE_LINKS.map(link => (
          <Link key={link.to} to={link.to} className="drawer-link" onClick={onClose}>
            <span style={{ color: 'var(--color-neon-cyan)' }}>{link.icon}</span>
            <span>{link.label}</span>
            <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)' }} />
          </Link>
        ))}

        <div className="drawer-divider" />

        {/* Legal */}
        <div style={{ display: 'flex', gap: 24, padding: '4px 0' }}>
          <Link to="/privacy" className="drawer-small-link" onClick={onClose}>Privacy</Link>
          <Link to="/terms"   className="drawer-small-link" onClick={onClose}>Terms</Link>
        </div>

        <div className="drawer-divider" />

        {/* Sign out */}
        <button className="drawer-signout" onClick={handleSignOut}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );
}

/* ───────────── Root Layout ───────────── */
function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="grid-bg" />
      <div className="app-container">
        <Sidebar />
        <div className="mobile-shell">
          <MobileHeader onMoreOpen={() => setDrawerOpen(true)} />
          <main className="main-content">
            <ErrorBoundary>
              <Routes>
                {/* Public */}
                <Route path="/"        element={<Splash />} />
                <Route path="/login"   element={<Login />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms"   element={<Terms />} />

                {/* Protected */}
                <Route path="/onboarding"  element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
                <Route path="/dashboard"   element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/graph"       element={<ProtectedRoute><MemoryGraph /></ProtectedRoute>} />
                <Route path="/sources"     element={<ProtectedRoute><DataSources /></ProtectedRoute>} />
                <Route path="/adapters"    element={<ProtectedRoute><AIAdapters /></ProtectedRoute>} />
                <Route path="/subscription" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
                <Route path="/docs"        element={<ProtectedRoute><BusinessDocs /></ProtectedRoute>} />
              </Routes>
            </ErrorBoundary>
          </main>
          <MobileTabBar />
          <MobileMoreDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </div>
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
