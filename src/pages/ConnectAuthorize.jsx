// The actual "Approve" screen in the OAuth dance: an AI tool's browser lands
// here (via mcp-oauth-authorize's redirect) with client/redirect/PKCE params
// in the query string. This page shows the user exactly what's connecting
// and what it can do, then calls mcp-oauth-consent with their normal AXON
// session — no API key ever touches the user's clipboard.
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Brain, Plug, ArrowRight, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { callFunction } from '../lib/functions';
import { AnthropicLogo, OpenAILogo, GeminiLogo, CursorLogo, PerplexityLogo } from '../lib/logos';

const CLIENT_LOGOS = {
  claude: AnthropicLogo,
  chatgpt: OpenAILogo,
  gemini: GeminiLogo,
  cursor: CursorLogo,
  perplexity: PerplexityLogo,
};


export default function ConnectAuthorize() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const req = useMemo(() => ({
    client_id: params.get('client_id') || '',
    redirect_uri: params.get('redirect_uri') || '',
    state: params.get('state') || '',
    scope: params.get('scope') || 'memory.read memory.write',
    code_challenge: params.get('code_challenge') || '',
    code_challenge_method: params.get('code_challenge_method') || 'S256',
  }), [params]);

  /* Who is asking, as the server sees it. The link that opened this page could
     name itself anything — "client_name=Claude" for a stranger's app — so the
     name, the logo and the warning come from mcp-oauth-consent, which reads the
     registered client and the host the code would actually be sent to. */
  const [client, setClient] = useState(null);
  const [describeError, setDescribeError] = useState(null);
  useEffect(() => {
    if (!req.client_id || !req.redirect_uri) return undefined;
    let cancelled = false;
    callFunction('mcp-oauth-consent', { body: { ...req, decision: 'describe' } })
      .then((res) => { if (!cancelled) setClient(res.client); })
      .catch((err) => { if (!cancelled) setDescribeError(err.message || 'This connection could not be checked.'); });
    return () => { cancelled = true; };
  }, [req]);

  const ClientLogo = client?.slug ? CLIENT_LOGOS[client.slug] : null;
  const clientName = client?.name ?? '…';
  const destination = client
    ? (client.local ? `an app on this device (${client.host || 'unknown'})` : (client.host || 'an unknown address'))
    : '';

  const scopes = req.scope.split(/\s+/).filter(Boolean);
  const scopeCopy = {
    'memory.read': { label: 'Read your memory', desc: 'See your notes, what your connected accounts brought in, and anything another AI tool saved for you.' },
    'memory.write': { label: 'Add to your memory', desc: 'Save new facts, preferences, and notes so your other AI tools know them too.' },
  };

  async function decide(decision) {
    setBusy(true);
    setError(null);
    setUpgradeRequired(false);
    try {
      const res = await callFunction('mcp-oauth-consent', { body: { ...req, decision } });
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
            {ClientLogo ? <ClientLogo size={28} /> : <Plug size={26} color="var(--color-neon-cyan)" />}
          </div>
          <ArrowRight size={18} color="var(--color-text-secondary)" />
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'radial-gradient(circle, rgba(0,243,255,0.18) 0%, transparent 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={28} color="var(--color-neon-cyan)" />
          </div>
        </div>

        <h1 style={{ fontSize: 20, textAlign: 'center', marginBottom: 6 }}>
          <strong>{clientName}</strong> wants to connect
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24 }}>
          to your AXON account{(profile?.email || user?.email) ? ` (${profile?.email || user?.email})` : ''}.
        </p>

        {client && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12.5, marginTop: -14, marginBottom: 20, overflowWrap: 'anywhere' }}>
            Approving sends you back to <strong style={{ color: 'var(--color-text-primary)' }}>{destination}</strong>.
          </p>
        )}

        {client && !client.verified && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <AlertTriangle size={16} color="#ffc107" style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', margin: 0 }}>
              AXON has not verified this app. It calls itself “{client.registeredName}”. Only approve if you started this connection yourself, just now.
            </p>
          </div>
        )}

        {describeError && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 16 }}>{describeError}</p>}

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
              Connecting AI tools (Claude, ChatGPT, Gemini, and more) is included on the Pro plan and above.
            </p>
            <button className="btn-primary" style={{ width: '100%', fontSize: 13 }} onClick={() => navigate('/subscription')}>
              View plans
            </button>
          </div>
        )}

        {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => decide('deny')}
            disabled={busy}
            className="btn-secondary"
            style={{ flex: 1 }}
          >
            Cancel
          </button>
          <button onClick={() => decide('approve')} disabled={busy || !client} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy || !client ? 0.7 : 1 }}>
            {busy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={16} />}
            {busy ? 'Connecting…' : `Approve for ${clientName}`}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
          You can withdraw it any time in Connect.
        </p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
