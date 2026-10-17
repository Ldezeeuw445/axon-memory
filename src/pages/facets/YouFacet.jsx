import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, LogOut, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/functions';
import { useAuth } from '../../contexts/AuthContext';
import { usePlan } from '../../hooks/usePlan';
import { PLAN_CATALOG } from '../../lib/planCatalog';
import { FacetHead, Paused, ago, providerName } from '../../components/app/ui';

/** Profile and privacy: what you have, who can read it, and how to take it back. */
export default function YouFacet({ onOpen }) {
  const { user, profile, signOut } = useAuth();
  const plan = usePlan();
  const navigate = useNavigate();
  const [usage, setUsage] = useState(null);
  const [keys, setKeys] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const head = (t, f = (q) => q) => f(supabase.from(t).select('id', { count: 'exact', head: true }).eq('user_id', user.id));
      const [mem, retired, threads, sources, recalls, k] = await Promise.all([
        head('memory_items', (q) => q.is('retired_at', null)),
        head('memory_items', (q) => q.not('retired_at', 'is', null)),
        head('projects'),
        head('source_connections', (q) => q.neq('status', 'disconnected')),
        supabase.from('memory_recalls').select('recall_count').eq('user_id', user.id).limit(5000),
        supabase.from('api_keys').select('id, name, display_name, oauth_client_id, last_used_at, created_at').eq('user_id', user.id).is('revoked_at', null).order('last_used_at', { ascending: false, nullsFirst: false }),
      ]);
      setUsage({ memories: mem.count ?? 0, retired: retired.count ?? 0, threads: threads.count ?? 0, sources: sources.count ?? 0,
        recalls: (recalls.data || []).reduce((s, r) => s + (r.recall_count || 0), 0) });
      setKeys(k.data || []);
    })();
  }, [user]);

  const planName = PLAN_CATALOG.find((p) => p.tier === plan.plan_tier)?.name || 'Starter';

  const exportAll = async () => {
    setExporting(true); setMsg(null);
    try {
      const page = async (table, cols) => {
        const out = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from(table).select(cols).eq('user_id', user.id).range(from, from + 999);
          if (error) throw error;
          out.push(...data);
          if (data.length < 1000) break;
        }
        return out;
      };
      const [memories, threads, conclusions, sources] = await Promise.all([
        page('memory_items', 'id, title, content, content_type, source_type, origin_key, project_id, facets, entities, metadata, occurred_at, created_at, retired_at, retired_reason, superseded_by'),
        page('projects', 'id, key, name, created_at'),
        page('memory_facts', 'id, statement, category, source_item_ids, project_id, first_seen_at, last_confirmed_at, superseded_at'),
        page('source_connections', 'id, provider, status, external_account_label, created_at, last_synced_at'),
      ]);
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), account: user.email, memories, threads, conclusions, sources }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `axon-memory-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ ok: true, text: `Downloaded ${memories.length} memories, ${threads.length} Threads.` });
    } catch (e) { setMsg({ text: e.message || 'The download was interrupted.' }); }
    finally { setExporting(false); }
  };

  const del = async () => {
    if (confirmText !== 'DELETE') return;
    setDeleting(true);
    try { await callFunction('delete-account'); await signOut(); navigate('/'); }
    catch (e) { setMsg({ text: e.message }); setDeleting(false); }
  };

  const ais = keys.filter((k) => k.oauth_client_id);
  const personal = keys.filter((k) => !k.oauth_client_id);

  return (
    <div className="ax-facet">
      <FacetHead eyebrow="You" title={profile?.full_name || user?.user_metadata?.full_name || 'Your Core'} sub={user?.email} />

      <div className="ax-grid-2" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <section className="ax-section">
          <div className="ax-section-label"><span>Plan and use</span></div>
          <div className="ax-card" style={{ gap: 0 }}>
            <div className="ax-kv"><span>Plan</span><span>{planName}{plan.plan_expires_at ? ` · renews ${new Date(plan.plan_expires_at).toLocaleDateString()}` : ''}</span></div>
            <div className="ax-kv"><span>Memories held</span><span>{usage ? usage.memories : '·'}</span></div>
            <div className="ax-kv"><span>Retired</span><span>{usage ? usage.retired : '·'}</span></div>
            <div className="ax-kv"><span>Threads</span><span>{usage ? usage.threads : '·'}</span></div>
            <div className="ax-kv"><span>Recalls by your AIs</span><span>{usage ? usage.recalls : '·'}</span></div>
          </div>
          <button className="ax-btn-quiet" onClick={() => navigate('/subscription')}>Plan and billing</button>
        </section>

        <section className="ax-section">
          <div className="ax-section-label"><span>Who can read your memory</span></div>
          <div className="ax-card" style={{ gap: 0 }}>
            {ais.length === 0 && personal.length === 0 && <div className="ax-kv"><span>No AI has access yet.</span></div>}
            {ais.map((k) => <div className="ax-kv" key={k.id}><span>{providerName(k.display_name || k.name)}</span><span>{k.last_used_at ? `recalled ${ago(k.last_used_at)}` : 'not used yet'}</span></div>)}
            {personal.length > 0 && <div className="ax-kv"><span>Personal keys</span><span>{personal.length}</span></div>}
            <div className="ax-kv"><span>Sources</span><span>{usage ? usage.sources : '·'}</span></div>
          </div>
          <button className="ax-btn-quiet" onClick={() => onOpen?.('connections')}>Manage and revoke</button>
        </section>
      </div>

      <section className="ax-section">
        <div className="ax-section-label"><span>Your data</span></div>
        <div className="ax-card" style={{ gap: 10, fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          <div style={{ display: 'flex', gap: 10 }}><Shield size={16} style={{ flexShrink: 0, marginTop: 3, color: 'var(--color-titanium)' }} />
            <span>Your memory is yours and readable only by you and the AIs you connect. <b style={{ color: '#fff', fontWeight: 500 }}>Retire</b> takes a memory out of recall and can be undone. <b style={{ color: '#fff', fontWeight: 500 }}>Delete</b> removes it for good, from every AI. Source tokens are encrypted, and disconnecting a source deletes them.</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="ax-btn-quiet" onClick={exportAll} disabled={exporting}><Download size={14} /> {exporting ? 'Preparing…' : 'Download everything'}</button>
            <a className="ax-btn-quiet" href="/privacy">Privacy</a>
            <a className="ax-btn-quiet" href="/terms">Terms</a>
          </div>
        </div>
        {msg && (msg.ok ? <div className="ax-quiet-ok">{msg.text}</div> : <Paused>{msg.text}</Paused>)}
      </section>

      <section className="ax-section">
        <div className="ax-section-label"><span>Leave</span></div>
        <button className="ax-btn-quiet" onClick={signOut} style={{ alignSelf: 'flex-start' }}><LogOut size={14} /> Sign out</button>
        <details className="ax-card" style={{ gap: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Delete your account</summary>
          <p className="ax-sub" style={{ fontSize: 13 }}>Everything goes: memories, Threads, sources, keys and your subscription link. It cannot be undone. Download first if you want a copy.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="ax-field" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type DELETE" aria-label="Type DELETE to confirm" style={{ fontSize: 14, padding: '10px 12px' }} />
            <button className="ax-btn-quiet" disabled={confirmText !== 'DELETE' || deleting} onClick={del}>{deleting ? 'Deleting…' : 'Delete'}</button>
          </div>
        </details>
      </section>
    </div>
  );
}
