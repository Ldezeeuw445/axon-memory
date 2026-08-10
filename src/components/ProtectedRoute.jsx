import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Brain } from 'lucide-react';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: '16px',
      }}>
        <Brain size={40} color="var(--color-neon-cyan)" style={{ animation: 'spin 1.5s linear infinite' }} />
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading AXON...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    // Preserve full path + query so flows like the MCP OAuth consent screen
    // (/connect/authorize?client_id=...) survive a login/signup round trip
    // instead of losing their params.
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return children;
}
