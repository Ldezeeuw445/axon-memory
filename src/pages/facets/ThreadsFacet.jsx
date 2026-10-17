import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { axon } from '../../lib/axonApi';
import { FacetHead, MemoryCard, Settling, Paused, ago } from '../../components/app/ui';

const DAY = 86400e3;
/** Depth, not a timeline: what is near the surface first, then deeper ground. */
function depthOf(iso) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 7 * DAY) return 'Near the surface';
  if (d < 45 * DAY) return 'A little deeper';
  if (d < 365 * DAY) return 'Deeper';
  return 'Bedrock';
}
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40);

export default function ThreadsFacet({ initial }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState(null);
  const [openKey, setOpenKey] = useState(initial?.thread || null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);

  const load = async () => {
    if (!user) return;
    const [{ data: ps }, { data: items }, { data: states }] = await Promise.all([
      supabase.from('projects').select('id, key, name, created_at').eq('user_id', user.id),
      supabase.from('memory_items').select('project_id, occurred_at').eq('user_id', user.id).is('retired_at', null).not('project_id', 'is', null).order('occurred_at', { ascending: false }).limit(2000),
      supabase.from('project_threads').select('project_id, state, updated_at').eq('user_id', user.id),
    ]);
    const n = new Map(); const last = new Map();
    for (const m of items || []) { n.set(m.project_id, (n.get(m.project_id) || 0) + 1); if (!last.has(m.project_id)) last.set(m.project_id, m.occurred_at); }
    const st = new Map((states || []).map((s) => [s.project_id, s]));
    setThreads((ps || []).map((p) => ({ ...p, n: n.get(p.id) || 0, last: last.get(p.id) || null, state: st.get(p.id)?.state || null }))
      .sort((a, b) => new Date(b.last || b.created_at) - new Date(a.last || a.created_at)));
  };
  useEffect(() => { load(); }, [user]);

  const create = async () => {
    const key = slug(name);
    if (!key) return;
    const { error } = await supabase.from('projects').insert({ user_id: user.id, key, name: name.trim() });
    if (error) { setMsg(error.code === '23505' ? 'A Thread with that name already exists.' : error.message); return; }
    setName(''); setCreating(false); setMsg(null); await load(); setOpenKey(key);
  };

  const open = threads?.find((t) => t.key === openKey);

  return (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div key={open.key} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}>
          <ThreadView thread={open} onBack={() => { setOpenKey(null); load(); }} />
        </motion.div>
      ) : (
        <motion.div key="list" className="ax-facet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <FacetHead eyebrow="Threads" title="Continuity, over time." sub="Each Thread is one strand: a project, a person, a decision. Everything any of your AIs keeps about it gathers here."
            right={<button className="ax-btn-quiet" onClick={() => setCreating((v) => !v)} aria-label="New Thread"><Plus size={15} /> New</button>} />
          {creating && (
            <form onSubmit={(e) => { e.preventDefault(); create(); }} style={{ display: 'flex', gap: 8 }}>
              <input className="ax-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it — e.g. AXE Core backend" aria-label="Thread name" />
              <button className="ax-btn" disabled={!slug(name)}>Start</button>
            </form>
          )}
          {msg && <Paused>{msg}</Paused>}
          {!threads && <Settling rows={4} />}
          {threads && threads.length === 0 && (
            <div className="ax-young"><strong>No Threads yet.</strong> Start one for whatever you keep coming back to. Capture into it, and every connected AI can recall it by name.</div>
          )}
          <div className="ax-list">
            {(threads || []).map((t, i) => (
              <motion.button key={t.id} className="ax-row" onClick={() => setOpenKey(t.key)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: Math.min(i, 8) * 0.05 }}>
                <span className="ax-thread-dot" style={{ background: t.last && Date.now() - new Date(t.last) < 7 * DAY ? 'var(--color-accent)' : undefined }} />
                <span className="ax-row-main">
                  <span className="ax-row-title">{t.name || t.key}</span>
                  <span className="ax-row-sub">{t.state || (t.n ? `${t.n} ${t.n === 1 ? 'memory' : 'memories'}` : 'Waiting for its first memory')}</span>
                </span>
                <span className="ax-meta" style={{ flexShrink: 0 }}>{t.last ? ago(t.last) : ''}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ThreadView({ thread, onBack }) {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [showRetired, setShowRetired] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const { data } = await supabase.from('memory_items')
      .select('id, title, content, project_id, facets, occurred_at, created_at, retired_at, source_type, source_connection_id, api_key_id, metadata, origin_key')
      .eq('user_id', user.id).eq('project_id', thread.id).order('occurred_at', { ascending: false }).limit(200);
    setItems(data || []);
  };
  useEffect(() => { load(); }, [thread.id]);

  const act = async (kind, m) => {
    setMsg(null);
    try {
      if (kind === 'retire') await axon.retire(m.id);
      if (kind === 'restore') await axon.restore(m.id);
      if (kind === 'delete') {
        if (!confirm('Delete this memory for good? It leaves every AI, and anything concluded only from it goes too.')) return;
        await axon.remove(m.id);
      }
      await load();
    } catch (e) { setMsg(e.message); }
  };

  const visible = (items || []).filter((m) => showRetired || !m.retired_at);
  const groups = useMemo(() => {
    const g = [];
    for (const m of visible) { const d = depthOf(m.occurred_at); if (!g.length || g[g.length - 1].d !== d) g.push({ d, items: [] }); g[g.length - 1].items.push(m); }
    return g;
  }, [visible]);
  const retiredCount = (items || []).filter((m) => m.retired_at).length;

  return (
    <div className="ax-facet">
      <button className="ax-btn-quiet" onClick={onBack} style={{ alignSelf: 'flex-start', padding: '7px 12px' }}><ChevronLeft size={15} /> Threads</button>
      <FacetHead eyebrow="Thread" title={thread.name || thread.key} sub={thread.state || null} />
      <div className="ax-meta" style={{ fontSize: 12 }}>
        <span>Recall it from any AI as <b>{thread.key}</b></span>
        {retiredCount > 0 && <button className="ax-btn-quiet" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setShowRetired((v) => !v)}>{showRetired ? 'Hide' : 'Show'} {retiredCount} retired</button>}
      </div>
      {msg && <Paused>{msg}</Paused>}
      {!items && <Settling rows={3} />}
      {items && visible.length === 0 && <div className="ax-young">Nothing in this Thread yet. Capture into it, or ask an AI to keep something under <strong>{thread.key}</strong>.</div>}
      <div className="ax-depth">
        {groups.map((g) => (
          <React.Fragment key={g.d}>
            <div className="ax-depth-label">{g.d}</div>
            {g.items.map((m, i) => <MemoryCard key={m.id} m={m} index={i} onAction={act} />)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
