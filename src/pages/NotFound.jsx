import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// A wrong address, said plainly. No "ingested", no "dashboard" (canon words only).
export default function NotFound() {
  return (
    <div className="fullscreen-page">
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
        <img src="/brand/axon-mark-256.webp" alt="" width="64" height="64" style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 22px', display: 'block', boxShadow: '0 0 28px rgba(255,183,51,0.16)' }} />
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 10 }}>404</div>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 10 }}>Nothing lives at this address</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 28, lineHeight: 1.6, fontSize: 15 }}>
          The link may be old or mistyped. Your memory is where you left it.
        </p>
        <Link to="/recall" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', padding: '12px 20px' }}>
          <ArrowLeft size={16} /> Back to Recall
        </Link>
      </div>
    </div>
  );
}
