import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="fullscreen-page">
        <div className="gradient-text" style={{ fontSize: 14, letterSpacing: 2 }}>LOADING…</div>
      </div>
    );
  }

  if (!session) {
    // Preserve the full path + query string (not just pathname) so flows
    // like OAuth consent (/connect/authorize?client_id=...) survive a
    // login/signup round trip instead of losing their params.
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return children;
}
