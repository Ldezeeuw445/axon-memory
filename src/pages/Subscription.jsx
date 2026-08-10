import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle, Zap, Shield, Cpu, Plug, Smartphone, Crown, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePlan } from '../hooks/usePlan';
import { callFunction } from '../lib/functions';
import { PLAN_CATALOG } from '../lib/planCatalog';

const ICONS = { starter: Shield, pro: Crown, ultra: Zap, lifetime_founder: Crown };

export default function Subscription() {
  const { isDemo } = useAuth();
  const plan = usePlan();
  const location = useLocation();
  const [loadingTier, setLoadingTier] = useState(null);
  const [error, setError] = useState(null);

  const params = new URLSearchParams(location.search);
  const justUpgraded = params.get('session_id');
  const cancelled = location.pathname.endsWith('/cancel');

  const currentTier = plan.status?.plan_tier || 'starter';

  const handleSubscribe = async (tier) => {
    if (isDemo) { setError('Connect Supabase to enable real billing.'); return; }
    setLoadingTier(tier);
    setError(null);
    try {
      const { url } = await callFunction('stripe-checkout', { body: { tier } });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoadingTier(null);
    }
  };

  const handleManageBilling = async () => {
    setLoadingTier('portal');
    try {
      const { url } = await callFunction('stripe-portal');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoadingTier(null);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Subscription</h1>
        <p className="page-subtitle">Simple, transparent pricing. Cancel anytime.</p>
      </header>

      {justUpgraded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(37,194,160,0.1)', border: '1px solid rgba(37,194,160,0.3)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <CheckCircle size={20} color="#25c2a0" />
          <div>
            <p style={{ fontWeight: 700, color: '#25c2a0' }}>Payment received — thank you! 🎉</p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Your plan updates within a few seconds as Stripe confirms the subscription.</p>
          </div>
        </div>
      )}

      {cancelled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,200,50,0.08)', border: '1px solid rgba(255,200,50,0.25)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <AlertTriangle size={20} color="#ffc832" />
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Checkout was cancelled. You're still on your current plan.</p>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <AlertTriangle size={16} color="#ff6b6b" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{error}</div>
        </div>
      )}

      <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', maxWidth: '1200px' }}>
        {PLAN_CATALOG.map((p) => {
          const Icon = ICONS[p.tier] || Shield;
          const isCurrent = currentTier === p.tier;
          const isOneTime = p.tier === 'lifetime_founder';
          return (
            <div key={p.tier} className="glass-card" style={{
              position: 'relative',
              border: p.recommended ? '1px solid rgba(0,243,255,0.3)' : undefined,
              boxShadow: p.recommended ? '0 0 30px rgba(0,243,255,0.08)' : undefined,
            }}>
              {(isCurrent || p.recommended) && (
                <div style={{
                  position: 'absolute', top: '-1px', left: '20px',
                  background: isCurrent ? 'rgba(255,255,255,0.15)' : 'linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-purple))',
                  padding: '3px 10px', borderRadius: '0 0 8px 8px', fontSize: '11px', fontWeight: 800,
                  color: isCurrent ? 'var(--color-text-secondary)' : '#000',
                }}>
                  {isCurrent ? 'CURRENT PLAN' : 'RECOMMENDED'}
                </div>
              )}
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon size={20} color="var(--color-neon-cyan)" />
                  <h2 style={{ fontSize: '20px', fontWeight: 800 }} className={p.recommended ? 'gradient-text' : ''}>{p.name}</h2>
                </div>
                <div style={{ margin: '12px 0 4px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 800 }}>{p.price}</span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}> {p.period}</span>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '20px' }}>{p.tagline}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '22px' }}>
                  {p.features.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px' }}>
                      <CheckCircle size={14} color="var(--color-neon-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
                      {f}
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px', background: 'rgba(37,194,160,0.1)', borderRadius: '10px', color: '#25c2a0', fontWeight: 700, justifyContent: 'center' }}>
                    <CheckCircle size={16} /> Active
                  </div>
                ) : (
                  <button
                    onClick={() => handleSubscribe(p.tier)}
                    disabled={loadingTier !== null}
                    className="btn-primary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', padding: '12px' }}
                  >
                    <Zap size={16} />
                    {loadingTier === p.tier ? 'Redirecting…' : p.cta}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentTier !== 'starter' && (
        <div style={{ marginTop: '20px' }}>
          <button onClick={handleManageBilling} disabled={loadingTier !== null} className="btn-secondary">
            {loadingTier === 'portal' ? 'Opening…' : 'Manage billing & invoices'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '32px' }}>
        {[
          { icon: <Shield size={20} />, label: 'Encrypted storage', desc: 'API keys & memory data AES-encrypted at rest' },
          { icon: <Cpu size={20} />, label: 'Token savings', desc: 'Compressed context reduces your AI API costs' },
          { icon: <Plug size={20} />, label: 'OAuth adapters', desc: 'Gmail, GitHub, Notion, Slack, Claude, ChatGPT & more' },
          { icon: <Smartphone size={20} />, label: 'Desktop app', desc: 'AXON Core desktop shell — launching soon' },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="glass-card" style={{ flex: '1 1 180px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ color: 'var(--color-neon-cyan)', flexShrink: 0, marginTop: '2px' }}>{icon}</div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{label}</p>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
