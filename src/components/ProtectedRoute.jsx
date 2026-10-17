import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // The void while the stored session is read (a few ms). No spinner, by canon.
  if (loading) return <div className="full-screen" style={{ background: '#020203' }} />;

  if (!user) {
    // Preserve full path + query so flows like the MCP OAuth consent screen
    // (/connect/authorize?client_id=...) survive a login/signup round trip
    // instead of losing their params.
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return children;
}
