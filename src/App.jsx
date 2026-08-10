import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './pages/Landing';
import Login from './pages/Login';
import { AuthProvider } from './contexts/AuthContext';

// We strip out the traditional Dashboard layout entirely.
// The Field is the primary layout paradigm.

function AppLayout() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Background handles the void style */}
        <div className="full-screen">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              {/* Future routes (like Dashboard, Settings) will be loaded as "facets" over the Core rather than flat pages */}
              <Route path="*" element={<Landing />} />
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
