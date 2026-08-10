import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';

import Splash from './pages/Splash';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import DataSources from './pages/DataSources';
import AIAdapters from './pages/AIAdapters';
import ConnectionsFacet from './pages/ConnectionsFacet';
import MemoryGraph from './pages/MemoryGraph';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import ConnectAuthorize from './pages/ConnectAuthorize';
import ConnectError from './pages/ConnectError';
import BusinessDocs from './pages/BusinessDocs';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import NotFound from './pages/NotFound';

function AppLayout() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="full-screen">
          <ErrorBoundary>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
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
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/sources" element={<ProtectedRoute><DataSources /></ProtectedRoute>} />
              <Route path="/adapters" element={<ProtectedRoute><AIAdapters /></ProtectedRoute>} />
              <Route path="/connections" element={<ProtectedRoute><ConnectionsFacet /></ProtectedRoute>} />
              <Route path="/graph" element={<ProtectedRoute><MemoryGraph /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

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
