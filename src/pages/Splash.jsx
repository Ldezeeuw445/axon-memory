import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain } from 'lucide-react';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/onboarding');
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="fullscreen-page" style={{ position: 'relative' }}>
      <div className="splash-logo" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        gap: '24px',
        animation: 'pulse 2s infinite'
      }}>
        <div style={{
          width: '120px', height: '120px',
          background: 'radial-gradient(circle, rgba(0,243,255,0.2) 0%, transparent 70%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%'
        }}>
          <Brain size={64} color="var(--color-neon-cyan)" />
        </div>
        <h1 className="gradient-text" style={{ fontSize: '48px', letterSpacing: '4px' }}>AXON</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '18px', letterSpacing: '1px' }}>The Stripe for AI Memory</p>
      </div>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 20px var(--color-neon-purple)); }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
