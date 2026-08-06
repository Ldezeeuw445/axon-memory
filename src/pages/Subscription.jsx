import React, { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { callFunction } from '../lib/functions';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../hooks/usePlan';
import { PLAN_CATALOG } from '../lib/planCatalog';

const TIER_RANK = { starter: 0, pro: 1, ultra: 2, lifetime_founder: 3 };

function PlanCard({ plan, currentTier, busyTier, onSelect }) {
  const isCurrent = currentTier === plan.tier;
  const isDowngrade = plan.tier !== 'lifetime_founder' && TIER_RANK[plan.tier] < TIER_RANK[currentTier] && currentTier !== 'starter';

  return (
    <div
      className="glass-card"
      style={{
        flex: 1,
        minWidth: 260,
        border: plan.recommended ? '1px solid var(--color-neon-cyan)' : '1px solid var(--color-border)',
        position: 'relative',
        padding: 30,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {plan.recommended && (
        <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-accent-gradient)', padding: '4px 14px', borderRadius: 12, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={12} /> MOST POPULAR
        </div>
      )}
      <h3 style={{ fontSize: 21, marginBottom: 2 }}>{plan.name}</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18, minHeight: 34 }}>{plan.tagline}</p>
      <div style={{ marginBottom: 22 }}>
        <span style={{ fontSize: 38, fontWeight: 800 }}>{plan.price}</span>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}> {plan.period}</span>
      </div>
      <ul style={{ listStyle: 'none', marginBottom: 26, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {plan.features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5 }}>
            <Check size={15} color="var(--color-neon-cyan)" style={{ marginTop: 2, flexShrink: 0 }} /> {f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(plan.tier)}
        disabled={isCurrent || busyTier === plan.tier}
        className="glow-btn"
        style={{
          width: '100%',
          background: plan.recommended ? 'var(--color-accent-gradient)' : 'rgba(255,255,255,0.1)',
          opacity: isCurrent ? 0.6 : 1,
        }}
      >
        {busyTier === plan.tier ? 'Redirecting…' : isCurrent ? 'Current plan' : isDowngrade ? `Switch to ${plan.name}` : plan.cta}
      </button>
    </div>
  );
}

export default function Subscription() {
  const { refreshProfile } = useAuth();
  const plan = usePlan();
  const [busyTier, setBusyTier] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success' || params.get('session_id')) {
      refreshProfile();
      plan.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = async (tier) => {
    setError(null);
    setBusyTier(tier);
    try {
      const { url } = await callFunction('stripe-checkout', { body: { tier } });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusyTier(null);
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { url } = await callFunction('stripe-portal');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setPortalBusy(false);
    }
  };

  const hasBilling = Boolean(plan.stripe_subscription_id) || plan.plan_tier === 'lifetime_founder';

  return (
    <div className="page-container">
      <header className="page-header" style={{ textAlign: 'center', maxWidth: 800, margin: '0 auto 40px auto' }}>
        <h1 className="page-title">Pick the memory layer that fits you</h1>
        <p className="page-subtitle" style={{ fontSize: 17, lineHeight: 1.6 }}>
          Every plan gives you one permanent, structured memory. Higher tiers unlock connecting more of the AI
          assistants you already use — all reading and writing the exact same brain.
        </p>
      </header>

      {!plan.loading && (
        <div className="glass-card" style={{ maxWidth: 720, margin: '0 auto 32px', textAlign: 'center', padding: 18 }}>
          <p style={{ marginBottom: hasBilling ? 12 : 0, fontSize: 14 }}>
            You're on the <strong className="gradient-text">{plan.plan_tier?.replace('_', ' ').toUpperCase()}</strong> plan
            {plan.plan_expires_at && ` · renews ${new Date(plan.plan_expires_at).toLocaleDateString()}`}.
          </p>
          {hasBilling && plan.plan_tier !== 'lifetime_founder' && (
            <button onClick={openPortal} disabled={portalBusy} className="glow-btn" style={{ background: 'rgba(255,255,255,0.08)', fontSize: 13 }}>
              {portalBusy ? 'Opening…' : 'Manage billing'}
            </button>
          )}
        </div>
      )}

      {error && <p style={{ color: '#ff6b6b', textAlign: 'center', marginBottom: 20 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1180, margin: '0 auto' }}>
        {PLAN_CATALOG.map((p) => (
          <PlanCard key={p.tier} plan={p} currentTier={plan.plan_tier} busyTier={busyTier} onSelect={startCheckout} />
        ))}
      </div>

      <p style={{ textAlign: 'center', marginTop: 40, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Questions about billing or a team plan? <a href="mailto:hello@axon-memory.com" style={{ color: 'var(--color-neon-cyan)' }}>hello@axon-memory.com</a>
      </p>
    </div>
  );
}
