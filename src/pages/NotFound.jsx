import React from 'react';
import { Link } from 'react-router-dom';
import { Brain, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="fullscreen-page">
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{
          width: 88, height: 88, borderRadius: 24, margin: '0 auto 24px',
          background: 'radial-gradient(circle, rgba(188,19,254,0.18) 0%, transparent 70%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Brain size={44} color="var(--color-neon-purple)" />
        </div>
        <h1 className="gradient-text" style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, marginBottom: 12 }}>404</h1>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>This memory doesn't exist</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
          The page you're looking for was never ingested — or it's been forgotten.
          Let's get you back to something that is remembered.
        </p>
        <Link to="/dashboard" className="glow-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
