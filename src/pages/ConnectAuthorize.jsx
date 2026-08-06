// The actual "Approve" screen in the OAuth dance: an AI tool's browser lands
// here (via mcp-oauth-authorize's redirect) with client/redirect/PKCE params
// in the query string. This page shows the user exactly what's connecting
// and what it can do, then calls mcp-oauth-consent with their normal Axon
// session — no API key ever touches the user's clipboard.
import React, { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Brain, Plug, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { callFunction } from '../lib/functions';
import { CLIENT_ICONS } from '../components/BrandIcons';

function detectClientSlug(clientId, clientName) {
  const s = `${clientId} ${clientName}`.toLowerCase();
  if (s.includes('claude')) return 'claude';
  if (s.includes('chatgpt') || s.includes('openai')) return 'chatgpt';
  if (s.includes('gemini')) return 'gemini';
  if (s.includes('cursor')) return 'cursor';
  if (s.includes('perplexity')) return 'perplexity';
  return null;
}

export default function ConnectAuthorize() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const req = useMemo(() => ({
    client_id: params.get('client_id') || '',
    client_name: params.get('client_name') || 'A third-party AI assistant',
    redirect_uri: params.get('redirect_uri') || '',
    state: params.get('state') || '',
    scope: params.get('scope') || 'memory.read memory.write',
    code_challenge: params.get('code_challenge') || '',
    code_challenge_method: params.get('code_challenge_method') || 'S256',
  }), [params]);

  const slug = detectClientSlug(req.client_id, req.client_name);
  const ClientIcon = slug ? CLIENT_ICONS[slug] : null;

  const scopes = req.scope.split(/\s+/).filter(Boolean);
  const scopeCopy = {
    'memory.read': { label: 'Read your memory', desc: 'See notes, connected-source data, and context you’ve shared with any assistant.' },
    'memory.write': { label: 'Add to your memory', desc: 'Save new facts, preferences, and notes so your other assistants know them too.' },
  };

  async function decide(decision) {
    setBusy(true);
    setError(null);
    setUpgradeRequired(false);
    try {
      const res = await callFunction('mcp-oauth-consent', {
        body: { ...req, decision },
      });
      window.location.href = res.redirect_to;
    } catch (err) {
      if (err.status === 402) {
        setUpgradeRequired(true);
      } else {
        setError(err.message || 'Something went wrong approving this connection.');
      }
      setBusy(false);
    }
  }

  if (!req.client_id || !req.redirect_uri) {
    return (
      <div className="fullscreen-page">
        <div className="glass-card" style={{ maxWidth: 440, padding: 36, textAlign: 'center' }}>
          <p style={{ color: '#ff6b6b' }}>This connection link is missing required information. Please restart the connection from the AI tool you're trying to link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: 460, width: '90%', padding: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)' }}>
            {ClientIcon ? <ClientIcon size={28} /> : <Plug size={26} />}
          </div>
          <ArrowRight size={18} color="var(--color-text-secondary)" />
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'radial-gradient(circle, rgba(0,243,255,0.18) 0%, transparent 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={28} color="var(--color-neon-cyan)" />
          </div>
        </div>

        <h1 style={{ fontSize: 20, textAlign: 'center', marginBottom: 6 }}>
          <strong>{req.client_name}</strong> wants to connect
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24 }}>
          to your Axon Memory account{profile?.email ? ` (${profile.email})` : ''}.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {scopes.map((s) => (
            <div key={s} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px' }}>
              <ShieldCheck size={16} color="var(--color-neon-cyan)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{scopeCopy[s]?.label || s}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{scopeCopy[s]?.desc || ''}</div>
              </div>
            </div>
          ))}
        </div>

        {upgradeRequired && (
          <div style={{ background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.35)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <Sparkles size={16} color="#ffc107" />
              <strong style={{ fontSize: 13 }}>Pro plan required</strong>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              Connecting AI assistants (Claude, ChatGPT, Gemini, and more) is included on the Pro plan and above.
            </p>
            <button className="glow-btn" style={{ width: '100%', fontSize: 13 }} onClick={() => navigate('/subscription')}>
              View plans
            </button>
          </div>
        )}

        {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => decide('deny')}
            disabled={busy}
            style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button onClick={() => decide('approve')} disabled={busy} className="glow-btn" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
            {busy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
            {busy ? 'Connecting…' : `Approve for ${req.client_name}`}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
          You can revoke this connection any time from AI Adapters.
        </p>
      </div>
    </div>
  );
}
