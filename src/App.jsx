import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Network, Plug, Zap, FileText, Settings as SettingsIcon, User, Database, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { isAppHost, APP_HOME } from './lib/host';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import MemoryGraph from './pages/MemoryGraph';
import AIAdapters from './pages/AIAdapters';
import DataSources from './pages/DataSources';
import Subscription from './pages/Subscription';
import BusinessDocs from './pages/BusinessDocs';
import SettingsPage from './pages/Settings';
import AdminAlerts from './pages/AdminAlerts';
import ConnectAuthorize from './pages/ConnectAuthorize';
import ConnectError from './pages/ConnectError';
import NotFound from './pages/NotFound';
import './App.css';

const PUBLIC_ROUTES = ['/', '/login'];

function Sidebar() {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  if (PUBLIC_ROUTES.includes(location.pathname) || location.pathname === '/onboarding' || location.pathname.startsWith('/connect/')) return null;

  const links = [
    { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/graph', icon: <Network size={20} />, label: 'Memory Graph' },
    { to: '/sources', icon: <Database size={20} />, label: 'Data Sources' },
    { to: '/adapters', icon: <Plug size={20} />, label: 'AI Adapters' },
    { to: '/subscription', icon: <Zap size={20} />, label: 'Subscription' },
    { to: '/docs', icon: <FileText size={20} />, label: 'Business Docs' },
    { to: '/settings', icon: <SettingsIcon size={20} />, label: 'Settings' },
  ];

  const tierLabels = { starter: 'Starter', pro: 'Pro', ultra: 'Ultra', lifetime_founder: 'Lifetime' };
  const planLabel = `${tierLabels[profile?.plan_tier] || 'Starter'} Plan`;

  return (
    <div className="sidebar glass-card">
      <div className="sidebar-logo">
        <Link to="/dashboard" style={{ textDecoration: 'none' }}>
          <h2 className="gradient-text">AXON</h2>
        </Link>
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
          <div className="avatar"><User size={16} /></div>
          <div className="user-info">
            <span className="name">{profile?.full_name || profile?.email || 'Loading…'}</span>
            <span className="plan gradient-text">{planLabel}</span>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', marginLeft: 'auto' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  return (
    <>
      <div className="grid-bg"></div>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            {/* "/" means different things on the two domains this build
                serves. On app.axon-memory.com the icon on someone's home
                screen has to open the PRODUCT — landing on a marketing page
                after tapping an installed app is the wrong answer. On the
                apex it is the marketing page, which is the point of it.
                ProtectedRoute sends you to /login from here if you are not
                signed in, which is the correct next step either way. */}
            <Route path="/" element={isAppHost() ? <Navigate to={APP_HOME} replace /> : <Landing />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/graph"
              element={
                <ProtectedRoute>
                  <MemoryGraph />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sources"
              element={
                <ProtectedRoute>
                  <DataSources />
                </ProtectedRoute>
              }
            />
            <Route
              path="/adapters"
              element={
                <ProtectedRoute>
                  <AIAdapters />
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscription"
              element={
                <ProtectedRoute>
                  <Subscription />
                </ProtectedRoute>
              }
            />
            <Route
              path="/docs"
              element={
                <ProtectedRoute>
                  <BusinessDocs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/connect/authorize"
              element={
                <ProtectedRoute>
                  <ConnectAuthorize />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/alerts"
              element={
                <ProtectedRoute>
                  <AdminAlerts />
                </ProtectedRoute>
              }
            />
            <Route path="/connect/error" element={<ConnectError />} />
            <Route path="/onboarding-redirect" element={<Navigate to="/onboarding" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
