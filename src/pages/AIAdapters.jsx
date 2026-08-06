import React, { useEffect, useState } from 'react';
import { Copy, Check, Trash2, Sparkles, ExternalLink, ChevronDown, ChevronUp, Plug } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { callFunction } from '../lib/functions';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../hooks/usePlan';
import { IconClaude, IconOpenAI, IconGemini, IconHttp } from '../components/BrandIcons';
import { MCP_GATEWAY_URL, CHATGPT_ACTION_CLIENT } from '../lib/platformClients';

function CopyField({ value, mask }) {
  const [copied, setCopied] = useState(false);
  const display = mask ? value.replace(/./g, (c, i) => (i < 8 ? c : '•')) : value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.35)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'monospace', fontSize: 12.5 }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
        style={{ background: 'none', border: 'none', color: 'var(--color-neon-cyan)', cursor: 'pointer', flexShrink: 0 }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function ConnectedRow({ conn, onRevoke, revoking }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600, fontSize: 14 }}>{conn.name}</p>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Connected {new Date(conn.created_at).toLocaleDateString()}
          {conn.last_used_at ? ` · last used ${new Date(conn.last_used_at).toLocaleDateString()}` : ' · not used yet'}
        </p>
      </div>
      <button onClick={() => onRevoke(conn.id)} disabled={revoking === conn.id} className="glow-btn" style={{ background: 'transparent', border: '1px solid var(--color-border)', padding: '6px 12px' }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function AdapterCard({ icon, name, children }) {
  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{name}</h3>
      </div>
      {children}
    </div>
  );
}

export default function AIAdapters() {
  const { user } = useAuth();
  const plan = usePlan();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [showChatGptSteps, setShowChatGptSteps] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualKeys, setManualKeys] = useState([]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKey, setNewKey] = useState(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    const all = data || [];
    setConnections(all.filter((k) => k.oauth_client_id));
    setManualKeys(all.filter((k) => !k.oauth_client_id));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const revoke = async (id) => {
    setRevoking(id);
    await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    await load();
    setRevoking(null);
  };

  const createManualKey = async () => {
    setCreatingKey(true);
    try {
      const res = await callFunction('api-keys-create', { body: { name: `Key ${manualKeys.length + 1}` } });
      setNewKey(res.key);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingKey(false);
    }
  };

  if (!plan.loading && !plan.has('axon_ai')) {
    return (
      <div className="page-container">
        <header className="page-header">
          <h1 className="page-title">AI Adapters</h1>
          <p className="page-subtitle">Connect Claude, ChatGPT, and other assistants to your shared memory.</p>
        </header>
        <div className="glass-card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: 36 }}>
          <Sparkles size={28} color="#ffc107" style={{ marginBottom: 10 }} />
          <h3 style={{ marginBottom: 8 }}>Connecting AI assistants is a Pro feature</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Upgrade to Pro or higher to connect Claude, ChatGPT, and any future assistant — all sharing one memory.
          </p>
          <a href="/subscription" className="glow-btn" style={{ display: 'inline-block' }}>View plans</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">AI Adapters</h1>
        <p className="page-subtitle">
          Connect an assistant once — every fact it learns is instantly available to every other assistant you connect.
        </p>
      </header>

      <div className="glass-card" style={{ marginBottom: 32, padding: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 14 }}>Connected assistants</h3>
        {loading ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Loading…</p>
        ) : connections.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Nothing connected yet — pick an assistant below.</p>
        ) : (
          connections.map((c) => <ConnectedRow key={c.id} conn={c} onRevoke={revoke} revoking={revoking} />)
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 28 }}>
        <AdapterCard icon={<IconClaude size={22} />} name="Claude">
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
            In Claude, go to <strong>Settings → Connectors → Add custom connector</strong>, paste this URL, then click Connect. You'll be asked to log in and approve — no key to copy.
          </p>
          <CopyField value={MCP_GATEWAY_URL} />
        </AdapterCard>

        <AdapterCard icon={<IconOpenAI size={20} />} name="ChatGPT">
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
            Create a Custom GPT, add this Action, and set Authentication to OAuth using the details below.
          </p>
          <button
            onClick={() => setShowChatGptSteps((s) => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--color-neon-cyan)', cursor: 'pointer', fontSize: 13, marginBottom: showChatGptSteps ? 14 : 0 }}
          >
            {showChatGptSteps ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showChatGptSteps ? 'Hide' : 'Show'} connection details
          </button>
          {showChatGptSteps && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Schema URL (import this first)</label>
              <CopyField value={CHATGPT_ACTION_CLIENT.openApiUrl} />
              <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>Client ID</label>
              <CopyField value={CHATGPT_ACTION_CLIENT.clientId} />
              <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>Client Secret</label>
              <CopyField value={CHATGPT_ACTION_CLIENT.clientSecret} mask />
              <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>Authorization URL</label>
              <CopyField value={CHATGPT_ACTION_CLIENT.authorizationUrl} />
              <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>Token URL</label>
              <CopyField value={CHATGPT_ACTION_CLIENT.tokenUrl} />
              <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>Scope</label>
              <CopyField value={CHATGPT_ACTION_CLIENT.scope} />
            </div>
          )}
        </AdapterCard>

        <AdapterCard icon={<IconGemini size={20} />} name="Gemini">
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Coming soon — Google hasn't yet published an open connector mechanism for Gemini Extensions the way Claude
            and ChatGPT have. We'll turn this on the moment they do.
          </p>
        </AdapterCard>

        <AdapterCard icon={<IconHttp size={20} />} name="Any tool with HTTP">
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
            Cursor, Windsurf, custom scripts, or anything that can make an authenticated HTTP call — use the MCP endpoint directly or a personal API key below.
          </p>
          <CopyField value={`${MCP_GATEWAY_URL}`} />
        </AdapterCard>
      </div>

      <div className="glass-card" style={{ padding: 20 }}>
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13, width: '100%' }}
        >
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Advanced: personal API keys (for scripts & tools without OAuth support)
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                Only use this if a tool truly can't do OAuth. Anything above is safer and easier for the same result.
              </p>
              <button onClick={createManualKey} disabled={creatingKey} className="glow-btn" style={{ fontSize: 12.5, whiteSpace: 'nowrap', marginLeft: 12 }}>
                <Plug size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                {creatingKey ? 'Creating…' : 'New key'}
              </button>
            </div>
            {newKey && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, marginBottom: 6 }}>Copy this now — it won't be shown again.</p>
                <CopyField value={newKey} />
              </div>
            )}
            {manualKeys.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No manual keys.</p>
            ) : (
              manualKeys.map((k) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
                  <span style={{ flex: 1, fontFamily: 'monospace' }}>{k.key_prefix}••••••••</span>
                  <button onClick={() => revoke(k.id)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
            <a
              href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/context-pack`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--color-neon-cyan)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12 }}
            >
              View the raw context-pack endpoint <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
