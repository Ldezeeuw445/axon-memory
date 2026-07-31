import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/onboarding'), 2600);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="fullscreen-page" style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        animation: 'splashIn 0.6s ease-out forwards',
      }}>
        {/* App icon */}
        <div style={{
          width: 100, height: 100, borderRadius: 24,
          overflow: 'hidden', boxShadow: '0 0 40px rgba(0,243,255,0.25), 0 0 80px rgba(191,111,255,0.15)',
          animation: 'pulse 2.2s ease-in-out infinite',
        }}>
          <img src="/app-icon-1024.png" alt="AXON" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h1 className="gradient-text" style={{ fontSize: 44, fontWeight: 900, letterSpacing: '4px', marginBottom: 8 }}>AXON</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 16, letterSpacing: '1px' }}>The Stripe for AI Memory</p>
        </div>

        {/* Loading dots */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--color-neon-cyan)',
              animation: `dot 1.4s ${i * 0.2}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splashIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(0.97); box-shadow: 0 0 30px rgba(0,243,255,0.2); }
          50%       { transform: scale(1.03); box-shadow: 0 0 50px rgba(0,243,255,0.4), 0 0 100px rgba(191,111,255,0.2); }
        }
        @keyframes dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
