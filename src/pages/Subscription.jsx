import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { CheckCircle, Zap, Shield, Cpu, Plug, Smartphone, Crown, AlertTriangle, ArrowLeft } from 'lucide-react';
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

  const currentTier = plan.loading ? null : (plan.plan_tier || 'starter');
  // Lifetime already includes every plan; the server refuses a checkout too (A11-3).
  const hasLifetime = currentTier === 'lifetime_founder';
  // One subscription per customer (A11-4): a subscriber switches plans in the
  // billing portal, which changes the existing subscription. The server
  // refuses a second subscription checkout with 409 already_subscribed too.
  const hasSubscription = !hasLifetime && Boolean(plan.stripe_subscription_id);
  const canManageBilling = Boolean(plan.stripe_customer_id) && (hasSubscription || (currentTier && currentTier !== 'starter'));

  const handleSubscribe = async (tier) => {
    if (isDemo) { setError({ message: 'Connect Supabase to enable real billing.' }); return; }
    setLoadingTier(tier);
    setError(null);
    try {
      const { url } = await callFunction('stripe-checkout', { body: { tier } });
      window.location.href = url;
    } catch (err) {
      setError({
        message: err.message,
        portal: err.status === 409 && err.code === 'already_subscribed',
      });
      setLoadingTier(null);
      if (err.status === 409) plan.refresh?.();
    }
  };

  const handleManageBilling = async () => {
    setLoadingTier('portal');
    setError(null);
    try {
      const { url } = await callFunction('stripe-portal');
      window.location.href = url;
    } catch (err) {
      setError({ message: err.message });
      setLoadingTier(null);
    }
  };

  return (
    <div className="page-container">
      <Link to="/?facet=you" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none', marginBottom: 14, padding: '6px 0' }}><ArrowLeft size={15} /> Back to You</Link>
      <header className="page-header">
        <h1 className="page-title">Your plan</h1>
        <p className="page-subtitle">One memory on every plan. Change or cancel any time.</p>
      </header>

      {justUpgraded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(37,194,160,0.1)', border: '1px solid rgba(37,194,160,0.3)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <CheckCircle size={20} color="#25c2a0" />
          <div>
            <p style={{ fontWeight: 700, color: '#25c2a0' }}>Payment received. Thank you.</p>
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
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {error.message}
            {error.portal && (
              <div style={{ marginTop: 10 }}>
                <button onClick={handleManageBilling} disabled={loadingTier !== null} className="btn-secondary" style={{ fontSize: 13, padding: '8px 14px' }}>
                  {loadingTier === 'portal' ? 'Opening…' : 'Open billing'}
                </button>
              </div>
            )}
          </div>
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
              border: p.recommended ? '1px solid rgba(255,183,51,0.3)' : undefined,
              boxShadow: p.recommended ? '0 0 30px rgba(255,183,51,0.08)' : undefined,
            }}>
              {(isCurrent || p.recommended) && (
                <div style={{
                  position: 'absolute', top: '-1px', left: '20px',
                  background: isCurrent ? 'rgba(255,255,255,0.15)' : 'linear-gradient(90deg, var(--color-accent), #ffd27a)',
                  padding: '3px 10px', borderRadius: '0 0 8px 8px', fontSize: '11px', fontWeight: 800,
                  color: isCurrent ? 'var(--color-text-secondary)' : '#000',
                }}>
                  {isCurrent ? 'CURRENT PLAN' : 'RECOMMENDED'}
                </div>
              )}
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon size={20} color="var(--color-accent)" />
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
                      <CheckCircle size={14} color="var(--color-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                      {f}
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px', background: 'rgba(37,194,160,0.1)', borderRadius: '10px', color: '#25c2a0', fontWeight: 700, justifyContent: 'center' }}>
                    <CheckCircle size={16} /> Active
                  </div>
                ) : hasLifetime ? (
                  <div style={{ padding: '11px', borderRadius: '10px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.04)' }}>
                    Included in your Lifetime plan
                  </div>
                ) : hasSubscription && !isOneTime ? (
                  <button
                    onClick={handleManageBilling}
                    disabled={loadingTier !== null}
                    className="btn-secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', padding: '12px' }}
                  >
                    {loadingTier === 'portal' ? 'Opening…' : 'Change plan in billing'}
                  </button>
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

      {canManageBilling && (
        <div style={{ marginTop: '20px' }}>
          <button onClick={handleManageBilling} disabled={loadingTier !== null} className="btn-secondary">
            {loadingTier === 'portal' ? 'Opening…' : 'Manage billing & invoices'}
          </button>
        </div>
      )}


      <p style={{ textAlign: 'center', marginTop: 40, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Questions about billing or a team plan? <a href="mailto:hello@axon-memory.com" style={{ color: 'var(--color-accent)' }}>hello@axon-memory.com</a>
      </p>
    </div>
  );
}
