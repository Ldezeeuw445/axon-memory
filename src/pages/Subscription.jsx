import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle, Zap, Shield, Cpu, Plug, Database, Smartphone, Crown, ExternalLink, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const FREE_FEATURES = [
  'Up to 100 memory nodes',
  '1 AI adapter',
  '1 data source',
  'Basic memory graph',
  'Web app access',
];

const PRO_FEATURES = [
  'Unlimited memory nodes',
  'All 5 AI adapters (OpenAI, Claude, Gemini, Perplexity, Cursor)',
  'Unlimited data sources',
  'Interactive memory graph with relationships',
  'Priority memory ingestion',
  'iOS & Android app (coming soon)',
  'API access for developers',
  'Priority support',
];

export default function Subscription() {
  const { user, isDemo } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [stripeAvailable, setStripeAvailable] = useState(null);

  const upgraded = new URLSearchParams(location.search).get('upgraded') === 'true';
  const cancelled = new URLSearchParams(location.search).get('cancelled') === 'true';

  useEffect(() => {
    if (upgraded) setCurrentPlan('pro');
  }, [upgraded]);

  useEffect(() => {
    // Check if Stripe backend is available
    fetch('/api/health').then(() => {
      setStripeAvailable(true);
    }).catch(() => {
      setStripeAvailable(false);
    });
  }, []);

  const handleSubscribe = async () => {
    if (!stripeAvailable) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email || '',
          userId: user?.id || '',
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Could not create checkout session');
      }
    } catch (err) {
      alert('Stripe is not configured yet. Add STRIPE_SECRET_KEY to your environment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Subscription</h1>
        <p className="page-subtitle">Simple, transparent pricing. Cancel anytime.</p>
      </header>

      {upgraded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(37,194,160,0.1)', border: '1px solid rgba(37,194,160,0.3)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <CheckCircle size={20} color="#25c2a0" />
          <div>
            <p style={{ fontWeight: 700, color: '#25c2a0' }}>Welcome to AXON Pro! 🎉</p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Your subscription is active. All features are now unlocked.</p>
          </div>
        </div>
      )}

      {cancelled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,200,50,0.08)', border: '1px solid rgba(255,200,50,0.25)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <AlertTriangle size={20} color="#ffc832" />
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Checkout was cancelled. You're still on the free plan.</p>
        </div>
      )}

      {stripeAvailable === false && !upgraded && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(255,200,50,0.08)', border: '1px solid rgba(255,200,50,0.25)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <AlertTriangle size={16} color="#ffc832" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: '#ffc832' }}>Stripe not configured yet.</strong>{' '}
            Add <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 6px', borderRadius: '4px' }}>STRIPE_SECRET_KEY</code> to your Replit Secrets to enable payments.{' '}
            <a href="https://stripe.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-neon-cyan)' }}>Create free Stripe account →</a>
          </div>
        </div>
      )}

      <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', maxWidth: '1000px' }}>
        {/* Free Plan */}
        <div className="glass-card" style={{ position: 'relative' }}>
          {currentPlan === 'free' && (
            <div style={{ position: 'absolute', top: '-1px', left: '20px', background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: '0 0 8px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              CURRENT PLAN
            </div>
          )}
          <div style={{ marginTop: '8px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Free</h2>
            <div style={{ fontSize: '36px', fontWeight: 800, margin: '12px 0 4px' }}>$0</div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '24px' }}>Forever free, no credit card needed</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <CheckCircle size={15} color="#25c2a0" style={{ flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pro Plan */}
        <div className="glass-card" style={{ position: 'relative', border: '1px solid rgba(0,243,255,0.3)', boxShadow: '0 0 30px rgba(0,243,255,0.08)' }}>
          <div style={{ position: 'absolute', top: '-1px', left: '20px', background: 'linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-purple))', padding: '3px 10px', borderRadius: '0 0 8px 8px', fontSize: '11px', fontWeight: 800, color: '#000' }}>
            {currentPlan === 'pro' ? 'ACTIVE' : 'RECOMMENDED'}
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Crown size={22} color="var(--color-neon-cyan)" />
              <h2 style={{ fontSize: '22px', fontWeight: 800 }} className="gradient-text">Pro</h2>
            </div>
            <div style={{ margin: '12px 0 4px' }}>
              <span style={{ fontSize: '36px', fontWeight: 800 }} className="gradient-text">$15</span>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>/month</span>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '24px' }}>Everything you need to maximize AI memory</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {PRO_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <CheckCircle size={15} color="var(--color-neon-cyan)" style={{ flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>

            {currentPlan === 'pro' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(37,194,160,0.1)', borderRadius: '10px', color: '#25c2a0', fontWeight: 700, justifyContent: 'center' }}>
                <CheckCircle size={18} /> Active — Thank you!
              </div>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={loading || stripeAvailable === false}
                className="btn-primary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px', padding: '14px', opacity: stripeAvailable === false ? 0.5 : 1 }}
              >
                <Zap size={18} />
                {loading ? 'Redirecting...' : 'Subscribe — $15/month'}
              </button>
            )}
            
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '10px' }}>
              Cancel anytime. Also available via <span style={{ color: 'var(--color-neon-cyan)' }}>Apple</span> / <span style={{ color: 'var(--color-neon-cyan)' }}>Google</span> in-app purchase.
            </p>
          </div>
        </div>

        {/* Lifetime Founder Plan */}
        <div className="glass-card" style={{ position: 'relative', border: '1px solid rgba(255, 170, 0, 0.4)', boxShadow: '0 0 40px rgba(255, 170, 0, 0.1)', background: 'rgba(255, 170, 0, 0.03)' }}>
          <div style={{ position: 'absolute', top: '-1px', left: '20px', background: 'linear-gradient(90deg, #ffaa00, #ffdd55)', padding: '3px 10px', borderRadius: '0 0 8px 8px', fontSize: '11px', fontWeight: 800, color: '#000' }}>
            EARLY ADOPTER
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Crown size={22} color="#ffaa00" />
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#ffaa00' }}>Founder</h2>
            </div>
            <div style={{ margin: '12px 0 4px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '36px', fontWeight: 800, color: '#ffaa00' }}>$299</span>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px', textDecoration: 'line-through' }}>$499</span>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '24px' }}>Pay once. Lifetime access to Pro.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {PRO_FEATURES.map((f, i) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <CheckCircle size={15} color="#ffaa00" style={{ flexShrink: 0 }} />
                  {i === PRO_FEATURES.length - 1 ? 'Early access to beta features' : f}
                </div>
              ))}
            </div>

            <button
              onClick={handleSubscribe}
              disabled={loading || stripeAvailable === false}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '16px', padding: '14px', borderRadius: '8px', background: 'linear-gradient(90deg, #ffaa00, #ff8800)', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', opacity: stripeAvailable === false ? 0.5 : 1 }}
            >
              <Zap size={18} />
              {loading ? 'Redirecting...' : 'Get Lifetime Access'}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '10px' }}>
              Secure payment via Stripe.
            </p>
          </div>
        </div>
      </div>

      {/* Feature icon row */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '32px' }}>
        {[
          { icon: <Shield size={20} />, label: 'Encrypted storage', desc: 'API keys & memory data AES-encrypted at rest' },
          { icon: <Cpu size={20} />, label: 'Token savings', desc: 'Compressed context reduces your AI API costs' },
          { icon: <Plug size={20} />, label: '5 AI adapters', desc: 'OpenAI, Claude, Gemini, Perplexity, Cursor' },
          { icon: <Smartphone size={20} />, label: 'Mobile apps', desc: 'iOS & Android apps — launching soon' },
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
