import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/functions';
import { useAuth } from '../../contexts/AuthContext';
import { usePlan } from '../../hooks/usePlan';
import { DATA_SOURCES } from '../../lib/logos';
import { MCP_GATEWAY_URL, CHATGPT_ACTION_CLIENT } from '../../lib/platformClients';
import { FacetHead, Settling, Paused, ago, providerName } from '../../components/app/ui';

/**
 * Connect — both directions of the same promise (spec §12, §20):
 *   who can READ your memory (AIs over MCP/OAuth, personal keys), and
 *   what it DRAWS FROM (sources, per the A8-1 connector contract).
 * Canon: no "sync", no "import", no red. A connector that cannot work says so
 * in one plain sentence and says what would fix it.
 */

// A8-1 health → a word a person would use. Only `healthy` reads as settled.
const STATE = {
  healthy: { word: 'Settled', tone: 'ok' },
  syncing: { word: 'Reading now', tone: 'live' },
  pending: { word: 'Not read yet', tone: 'quiet' },
  stale: { word: 'Quiet for a while', tone: 'paused' },
  stuck: { word: 'Paused', tone: 'paused' },
  failing: { word: 'Paused', tone: 'paused' },
  unsupported: { word: 'Not readable yet', tone: 'quiet' },
  disconnected: { word: 'Disconnected', tone: 'quiet' },
};
const TONE = { ok: 'var(--color-accent)', live: '#FFD98A', paused: '#c9a35a', quiet: 'var(--color-text-secondary)' };
const READABLE = ['gmail', 'github', 'notion', 'slack', 'linear'];

const MCP_CLIENTS = [
  { name: 'Claude', steps: 'Settings → Connectors → Add custom connector → paste the address.' },
  { name: 'ChatGPT', steps: 'Settings → Apps → Advanced → Developer mode on, then Connectors → Create → paste the address.' },
  { name: 'Cursor', steps: 'Settings → MCP → Add new MCP server → paste the address as a remote server.' },
  { name: 'Perplexity', steps: 'Pro or higher: Settings → Connectors → Add custom remote connector.' },
  { name: 'Grok', steps: 'Paid accounts: Settings → Connectors → Add custom connector.' },
];

function CopyLine({ value, mask }) {
  const [done, setDone] = useState(false);
  const shown = mask ? value.replace(/./g, (c, i) => (i < 8 ? c : '•')) : value;
  return (
    <div className="ax-field" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</span>
      <button className="ax-icon-btn" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }}>
        {done ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

function errorSentence(c) {
  if (!c.error) return null;
  if (c.error.kind === 'auth') return `${c.name} no longer lets AXON in. Reconnect it to continue.`;
  if (c.error.kind === 'permission') return `${c.name} withheld a permission AXON needs. Reconnect and allow it.`;
  return `The last read from ${c.name} was interrupted${c.consecutive_failures > 1 ? ` (${c.consecutive_failures} times in a row)` : ''}. ${c.error.action || 'AXON will try again on its own.'}`;
}

function SourceConnection({ c, busy, onRead, onDisconnect, onReconnect }) {
  const [open, setOpen] = useState(false);
  const s = STATE[c.health] || STATE.pending;
  const needsYou = c.error && (c.error.kind === 'auth' || c.error.kind === 'permission');
  const kept = c.imported?.items;
  return (
    <div className="ax-card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ax-row-title">{c.account || c.name}</div>
          <div className="ax-row-sub">
            {kept != null ? `${kept} ${kept === 1 ? 'memory' : 'memories'} from here` : 'Nothing kept from here yet'}
            {c.last_success_at ? ` · last read ${ago(c.last_success_at)}` : ''}
          </div>
        </div>
        <span data-health={c.health} style={{ fontSize: 12, color: TONE[s.tone], whiteSpace: 'nowrap' }}>{s.word}</span>
      </div>
      {errorSentence(c) && <div style={{ marginTop: 10 }}><Paused>{errorSentence(c)}</Paused></div>}
      {c.health !== 'disconnected' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {needsYou ? (
            <button className="ax-btn" onClick={() => onReconnect(c.provider)} disabled={busy}>Reconnect</button>
          ) : c.supported ? (
            <button className="ax-btn-quiet" onClick={() => onRead(c)} disabled={busy}>{busy ? 'Reading…' : 'Read now'}</button>
          ) : null}
          <button className="ax-btn-quiet" onClick={() => setOpen((v) => !v)}>{open ? 'Less' : 'Permissions'}</button>
          <button className="ax-btn-quiet" onClick={() => onDisconnect(c)} disabled={busy}>Disconnect</button>
        </div>
      )}
      {open && (
        <div className="ax-meta" style={{ marginTop: 10, lineHeight: 1.6, display: 'block' }}>
          <div>{c.scope?.explanation}</div>
          {c.scope?.note && <div>{c.scope.note}</div>}
          <div>Granted: {c.scope?.granted ? c.scope.granted.join(', ') : 'as set by the provider'}</div>
          <div>
            Disconnecting deletes AXON's access{c.revoke?.method === 'provider_api' ? ` and withdraws it at ${c.name}` : ''}. Memories already kept stay yours until you retire or delete them.
            {c.revoke?.manage_url && <> Manage at <a href={c.revoke.manage_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>{new URL(c.revoke.manage_url).hostname}</a>.</>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConnectFacet() {
  const { user } = useAuth();
  const plan = usePlan();
  const [params, setParams] = useSearchParams();
  const [keys, setKeys] = useState(null);
  const [connectors, setConnectors] = useState(null);
  const [loadIssue, setLoadIssue] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [howOpen, setHowOpen] = useState(false);
  const [ownOpen, setOwnOpen] = useState(false);
  const [newKey, setNewKey] = useState(null);

  const loadKeys = async () => {
    const { data } = await supabase.from('api_keys').select('id, name, display_name, key_prefix, oauth_client_id, created_at, last_used_at')
      .eq('user_id', user.id).is('revoked_at', null).order('created_at', { ascending: false });
    setKeys(data || []);
  };
  const loadSources = async () => {
    try {
      const res = await callFunction('connectors', { method: 'GET' });
      setConnectors(res?.connectors || []);
      setLoadIssue(null);
    } catch {
      setConnectors((c) => c ?? []);
      setLoadIssue('Your sources could not be read just now. Nothing about them changed.');
    }
  };
  useEffect(() => { if (user) { loadKeys(); loadSources(); } }, [user]);

  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) setNote(`${providerName(connected)} is connected. AXON is reading it for the first time.`);
    if (error) setNote(`That connection was interrupted before it formed. You can try again.`);
    if (connected || error) setParams((p) => { p.delete('connected'); p.delete('error'); return p; }, { replace: true });
  }, []);

  const connect = async (provider) => {
    setBusy(`new:${provider}`);
    try {
      const { url } = await callFunction('oauth-start', { method: 'GET', query: { provider } });
      window.location.href = url;
    } catch {
      setNote(`${providerName(provider)} could not be reached just now. Try again in a moment.`);
      setBusy(null);
    }
  };
  const read = async (c) => {
    setBusy(c.id);
    try {
      const res = await callFunction('sync-source', { body: { source_connection_id: c.id } });
      const n = res?.synced ?? 0;
      setNote(n > 0 ? `${n} new ${n === 1 ? 'memory' : 'memories'} from ${c.name}.` : `${c.name} had nothing new.`);
    } catch {
      setNote(`The read from ${c.name} was interrupted. AXON will try again on its own.`);
    } finally { await loadSources(); setBusy(null); }
  };
  const disconnect = async (c) => {
    if (!window.confirm(`Disconnect ${c.name}${c.account ? ` (${c.account})` : ''}? Memories already kept stay yours.`)) return;
    setBusy(c.id);
    try {
      const res = await callFunction('disconnect-source', { body: { source_connection_id: c.id } });
      setNote(res?.revoked_at_provider ? `${c.name} is disconnected, and its access withdrawn at ${c.name}.` : `${c.name} is disconnected. AXON no longer holds its access.`);
    } catch {
      setNote(`Disconnecting ${c.name} was interrupted. Nothing changed; try again.`);
    } finally { await loadSources(); setBusy(null); }
  };
  const revoke = async (k) => {
    if (!window.confirm(`Stop ${k.name || 'this key'} from reading your memory?`)) return;
    setBusy(k.id);
    await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', k.id);
    await loadKeys();
    setBusy(null);
    setNote(`${k.name || 'That key'} can no longer read your memory.`);
  };
  const createKey = async () => {
    setBusy('key');
    try {
      const res = await callFunction('api-keys-create', { body: { name: `Key ${(keys || []).filter((k) => !k.oauth_client_id).length + 1}` } });
      setNewKey(res.key);
      await loadKeys();
    } catch {
      setNote('A key could not be made just now.');
    } finally { setBusy(null); }
  };

  const ais = (keys || []).filter((k) => k.oauth_client_id);
  const own = (keys || []).filter((k) => !k.oauth_client_id);
  const byProvider = {};
  for (const c of connectors || []) (byProvider[c.provider] ||= []).push(c);
  const providers = [...new Set([...READABLE, ...Object.keys(byProvider)])];
  const canAI = plan.loading || plan.has('axon_ai');
  const canKeys = !plan.loading && plan.has('api_access');

  return (
    <div className="ax-facet">
      <FacetHead eyebrow="Connect" title="Who reads it. Where it comes from." sub="Every AI you allow reads the same memory. Every source you connect adds to it. You can withdraw either at any time." />
      {note && <div className="ax-quiet-ok" role="status" onClick={() => setNote(null)}>{note}</div>}

      <section className="ax-section">
        <div className="ax-section-label">AIs that can read your memory</div>
        {keys === null ? <Settling rows={2} /> : ais.length === 0 ? (
          <div className="ax-young">No AI reads your memory yet. Add the address below to the AI you use most.</div>
        ) : (
          <div className="ax-list">
            {ais.map((k) => (
              <div key={k.id} className="ax-row" style={{ cursor: 'default' }}>
                <span className="ax-thread-dot" style={{ background: k.last_used_at && Date.now() - new Date(k.last_used_at) < 7 * 864e5 ? 'var(--color-accent)' : 'rgba(255,255,255,0.25)' }} />
                <div className="ax-row-main">
                  <div className="ax-row-title">{k.display_name || k.name || 'An AI you connected'}</div>
                  <div className="ax-row-sub">{k.last_used_at ? `Last read ${ago(k.last_used_at)}` : 'Has not read anything yet'} · allowed {ago(k.created_at)}</div>
                </div>
                <button className="ax-btn-quiet" onClick={() => revoke(k)} disabled={busy === k.id}>Withdraw</button>
              </div>
            ))}
          </div>
        )}

        {canAI ? (
          <div className="ax-card" style={{ marginTop: 12 }}>
            <div className="ax-card-title">Your memory's address</div>
            <div className="ax-card-body" style={{ marginBottom: 10 }}>Paste it into any AI that accepts an MCP connector. You will sign in to AXON and choose what it may do. There is no key to copy back.</div>
            <CopyLine value={MCP_GATEWAY_URL} />
            <button className="ax-btn-quiet" style={{ marginTop: 10 }} onClick={() => setHowOpen((v) => !v)}>
              {howOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Where to paste it
            </button>
            {howOpen && (
              <div style={{ marginTop: 8 }}>
                {MCP_CLIENTS.map((c) => <div key={c.name} className="ax-kv" style={{ flexDirection: 'column', gap: 2 }}><strong style={{ fontWeight: 500 }}>{c.name}</strong><span className="ax-meta" style={{ display: 'block' }}>{c.steps}</span></div>)}
                <div className="ax-meta" style={{ display: 'block', marginTop: 8 }}>Gemini and Kimi have no remote MCP connector we could verify yet.</div>
              </div>
            )}
          </div>
        ) : (
          <div className="ax-card" style={{ marginTop: 12 }}>
            <div className="ax-card-title">Letting AIs read your memory comes with Pro</div>
            <div className="ax-card-body" style={{ marginBottom: 12 }}>Your memory stays yours on Starter. Pro and above let Claude, ChatGPT, Cursor and other MCP clients read it.</div>
            <a className="ax-btn" href="/subscription">See plans</a>
          </div>
        )}
      </section>

      <section className="ax-section">
        <div className="ax-section-label">Where it comes from</div>
        {loadIssue && <Paused>{loadIssue}</Paused>}
        {connectors === null ? <Settling rows={3} /> : (
          <div className="ax-list">
            {providers.map((p) => {
              const tile = DATA_SOURCES.find((d) => d.id === p);
              const conns = byProvider[p] || [];
              const live = conns.filter((c) => c.health !== 'disconnected');
              const Logo = tile?.Logo;
              return (
                <div key={p} data-provider={p} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="ax-row" style={{ cursor: 'default' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {Logo ? <Logo size={18} /> : <span style={{ fontSize: 13 }}>{providerName(p).charAt(0)}</span>}
                    </div>
                    <div className="ax-row-main">
                      <div className="ax-row-title">{tile?.name || providerName(p)}</div>
                      <div className="ax-row-sub">{tile?.tagline || 'Connected source'}</div>
                    </div>
                    {READABLE.includes(p) ? (
                      <button className="ax-btn-quiet" onClick={() => connect(p)} disabled={busy === `new:${p}`}>
                        {busy === `new:${p}` ? 'Opening…' : live.length ? <><Plus size={13} /> Another</> : 'Connect'}
                      </button>
                    ) : <span className="ax-meta">Not readable yet</span>}
                  </div>
                  {conns.map((c) => (
                    <div key={c.id} style={{ paddingLeft: 14 }}>
                      <SourceConnection c={c} busy={busy === c.id} onRead={read} onDisconnect={disconnect} onReconnect={connect} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="ax-section">
        <button className="ax-btn-quiet" onClick={() => setOwnOpen((v) => !v)}>
          {ownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} For your own tools: personal keys
        </button>
        {ownOpen && (
          <div className="ax-card" style={{ marginTop: 10 }}>
            <div className="ax-card-body" style={{ marginBottom: 10 }}>For scripts and tools that cannot sign in. The address above is safer for anything that can.</div>
            {canKeys
              ? <button className="ax-btn" onClick={createKey} disabled={busy === 'key'}>{busy === 'key' ? 'Making…' : 'New key'}</button>
              : <div className="ax-meta" style={{ display: 'block' }}>Personal keys come with Power and Lifetime.</div>}
            {newKey && <div style={{ marginTop: 10 }}><div className="ax-meta" style={{ display: 'block', marginBottom: 6 }}>Copy it now. It will not be shown again.</div><CopyLine value={newKey} /></div>}
            {own.map((k) => (
              <div key={k.id} className="ax-kv">
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{k.name || k.key_prefix} · {k.key_prefix}••••</span>
                <button className="ax-btn-quiet" onClick={() => revoke(k)} disabled={busy === k.id}>Withdraw</button>
              </div>
            ))}
            <details style={{ marginTop: 12 }}>
              <summary className="ax-meta" style={{ cursor: 'pointer' }}>Building a Custom GPT action instead</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {[['Schema URL', CHATGPT_ACTION_CLIENT.openApiUrl], ['Client ID', CHATGPT_ACTION_CLIENT.clientId], ['Authorization URL', CHATGPT_ACTION_CLIENT.authorizationUrl], ['Token URL', CHATGPT_ACTION_CLIENT.tokenUrl], ['Scope', CHATGPT_ACTION_CLIENT.scope]].map(([l, v]) => (
                  <div key={l}><div className="ax-meta" style={{ display: 'block', marginBottom: 4 }}>{l}</div><CopyLine value={v} /></div>
                ))}
                <div><div className="ax-meta" style={{ display: 'block', marginBottom: 4 }}>Client secret</div><CopyLine value={CHATGPT_ACTION_CLIENT.clientSecret} mask /></div>
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
