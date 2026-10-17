import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { isAppHost, APP_HOME } from './lib/host';

import Splash from './pages/Splash';
import Home from './pages/Home';
import AppShell from './pages/AppShell';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import ConnectAuthorize from './pages/ConnectAuthorize';
import ConnectError from './pages/ConnectError';
import BusinessDocs from './pages/BusinessDocs';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import AdminAlerts from './pages/AdminAlerts';
import NotFound from './pages/NotFound';

/** Sends a legacy route into the shell, preserving any query the callback added. */
function FacetRedirect({ facet }) {
  const q = new URLSearchParams(window.location.search);
  q.set('facet', facet);
  return <Navigate to={`/?${q.toString()}`} replace />;
}

/**
 * "/" is the cinematic landing on the marketing domain, and the product on
 * app.axon-memory.com (home-screen icon / installed PWA). A facet query means
 * we are already inside the shell — do not bounce again.
 */
function HomeRoute() {
  const facet = new URLSearchParams(window.location.search).get('facet');
  if (facet) return <AppShell />;
  if (isAppHost()) return <Navigate to={APP_HOME} replace />;
  return <Home />;
}

function AppLayout() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="full-screen">
          <ErrorBoundary>
            <Routes>
              {/* Public */}
              <Route path="/" element={<HomeRoute />} />
              <Route path="/login" element={<Login />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/docs" element={<BusinessDocs />} />

              {/* MCP OAuth consent — reached from an external AI tool's
                  browser, so it must stay reachable pre-auth; ProtectedRoute
                  preserves the full path+query through a login round trip. */}
              <Route path="/connect/authorize" element={<ProtectedRoute><ConnectAuthorize /></ProtectedRoute>} />
              <Route path="/connect/error" element={<ConnectError />} />

              {/* App (authenticated) */}
              <Route path="/splash" element={<ProtectedRoute><Splash /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              {/* One surface only. These used to render a second, plainer copy of
                  each screen outside the shell — different chrome, no Core — so
                  landing on one meant leaving the app. They now open the shell
                  on the matching facet, query string and all, which is what the
                  OAuth callback relies on to bring people back inside. */}
              <Route path="/dashboard" element={<FacetRedirect facet="recall" />} />
              <Route path="/recall" element={<FacetRedirect facet="recall" />} />
              {/* Share sheet target (manifest share_target): ?title=&text=&url= */}
              <Route path="/capture" element={<FacetRedirect facet="capture" />} />
              <Route path="/threads" element={<FacetRedirect facet="threads" />} />
              <Route path="/terrain" element={<FacetRedirect facet="terrain" />} />
              <Route path="/you" element={<FacetRedirect facet="you" />} />
              <Route path="/sources" element={<FacetRedirect facet="connections" />} />
              <Route path="/adapters" element={<FacetRedirect facet="connections" />} />
              <Route path="/connections" element={<FacetRedirect facet="connections" />} />
              <Route path="/graph" element={<FacetRedirect facet="terrain" />} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/admin/alerts" element={<ProtectedRoute><AdminAlerts /></ProtectedRoute>} />

              {/* Billing */}
              <Route path="/subscription" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
              <Route path="/billing/success" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
              <Route path="/billing/cancel" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <AppLayout />
  );
}
