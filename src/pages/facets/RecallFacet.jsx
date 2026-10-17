import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Mic, X, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { axon } from '../../lib/axonApi';
import { FacetHead, MemoryCard, Settling, Paused, ago, providerName } from '../../components/app/ui';
import { useVoice } from '../../components/app/useVoice';

/**
 * Home. One dominant way in — Recall — and below it what AXON is holding right
 * now: the Threads you are in, the memories your AIs have been leaning on, and
 * the Facets that run through it all. Browsing here reads the rows directly
 * (it must not count as a recall); only an explicit recall goes through /v1.
 */
export default function RecallFacet({ onOpen }) {
  const { user, profile } = useAuth();
  const [q, setQ] = useState('');
  const [facet, setFacet] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [home, setHome] = useState(null);
  const inputRef = useRef(null);
  const voice = useVoice((text) => setQ((v) => (v ? `${v} ${text}` : text)));

  useEffect(() => {
    if (!user) return;
    let off = false;
    (async () => {
      const [threads, items, recalls, total] = await Promise.all([
        supabase.from('projects').select('id, key, name, created_at').eq('user_id', user.id),
        supabase.from('memory_items').select('id, title, content, project_id, facets, occurred_at, created_at, source_type, source_connection_id, api_key_id, metadata, origin_key')
          .eq('user_id', user.id).is('retired_at', null).order('occurred_at', { ascending: false }).limit(60),
        supabase.from('memory_recalls').select('memory_item_id, client_label, last_recalled_at, recall_count')
          .eq('user_id', user.id).order('last_recalled_at', { ascending: false }).limit(40),
        supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('retired_at', null),
      ]);
      if (off) return;
      const list = items.data || [];
      const byId = new Map(list.map((m) => [m.id, m]));
      // Threads ordered by their latest memory: where you actually are, not where you started.
      const last = new Map();
      const count = new Map();
      for (const m of list) if (m.project_id) { count.set(m.project_id, (count.get(m.project_id) || 0) + 1); if (!last.has(m.project_id)) last.set(m.project_id, m); }
      const ths = (threads.data || []).map((t) => ({ ...t, last: last.get(t.id), n: count.get(t.id) || 0 }))
        .sort((a, b) => new Date(b.last?.occurred_at || b.created_at) - new Date(a.last?.occurred_at || a.created_at));
      // Strengthened: memories an AI recalled most recently, with who leaned on them.
      const seen = new Set();
      const strengthened = [];
      const maxCount = Math.max(1, ...(recalls.data || []).map((r) => r.recall_count || 1));
      for (const r of recalls.data || []) {
        if (seen.has(r.memory_item_id)) continue;
        seen.add(r.memory_item_id);
        strengthened.push({ memory_item_id: r.memory_item_id, by: r.client_label, at: r.last_recalled_at, weight: (r.recall_count || 1) / maxCount });
        if (strengthened.length >= 4) break;
      }
      const missing = strengthened.filter((s) => !byId.has(s.memory_item_id)).map((s) => s.memory_item_id);
      if (missing.length) {
        const { data } = await supabase.from('memory_items').select('id, title, content, project_id, facets, occurred_at, created_at, source_type, source_connection_id, api_key_id, metadata, origin_key').in('id', missing);
        for (const m of data || []) byId.set(m.id, m);
      }
      const facetCount = new Map();
      for (const m of list) for (const f of m.facets || []) facetCount.set(f, (facetCount.get(f) || 0) + 1);
      const facets = [...facetCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([f]) => f);
      const activeBy = [...new Set((recalls.data || []).filter((r) => Date.now() - new Date(r.last_recalled_at) < 7 * 86400e3).map((r) => r.client_label).filter(Boolean))].slice(0, 4);
      if (!off) setHome({
        threads: ths, total: total.count ?? list.length, facets, activeBy,
        strengthened: strengthened.map((s) => ({ ...s, m: byId.get(s.memory_item_id) })).filter((s) => s.m),
        recent: list.slice(0, 4),
        threadName: new Map((threads.data || []).map((t) => [t.id, t.name || t.key])),
      });
    })();
    return () => { off = true; };
  }, [user]);

  const runRecall = async (query = q, f = facet) => {
    if (!query.trim() && !f) { setResult(null); return; }
    setBusy(true); setErr(null);
    try {
      const r = await axon.recall({ query: query.trim() || undefined, facets: f ? [f] : undefined, limit: 20 });
      setResult(r);
    } catch (e) {
      setErr(e.status === 0 ? 'No connection right now. Recall works again the moment it returns.' : e.message);
    } finally { setBusy(false); }
  };

  const toggleFacet = (f) => { const next = facet === f ? null : f; setFacet(next); if (next || q.trim()) runRecall(q, next); else setResult(null); };
  const clear = () => { setQ(''); setFacet(null); setResult(null); setErr(null); inputRef.current?.focus(); };
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || '').split(' ')[0];
  const showing = !!result || busy;

  return (
    <div className="ax-facet">
      <FacetHead eyebrow="Recall" title={firstName ? `What do you need, ${firstName}?` : 'What do you need?'} />

      <form className="ax-recall" onSubmit={(e) => { e.preventDefault(); runRecall(); }} role="search">
        <Search size={18} color="rgba(255,255,255,0.4)" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="A decision, a person, a detail…" aria-label="Recall" enterKeyHint="search" />
        {(q || result) && <button type="button" className="ax-icon-btn" onClick={clear} aria-label="Clear"><X size={17} /></button>}
        {voice.supported && (
          <button type="button" className={`ax-icon-btn${voice.listening ? ' is-live' : ''}`} onClick={voice.toggle} aria-label={voice.listening ? 'Stop listening' : 'Speak'}><Mic size={18} /></button>
        )}
        <button type="submit" className="ax-icon-btn" aria-label="Recall" style={{ color: q.trim() ? 'var(--color-accent)' : undefined }}><ArrowRight size={18} /></button>
      </form>

      {home?.facets?.length > 0 && (
        <div className="ax-chips" aria-label="Facets">
          {home.facets.map((f) => <button key={f} className={`ax-chip${facet === f ? ' is-on' : ''}`} onClick={() => toggleFacet(f)}>{f}</button>)}
        </div>
      )}

      <AnimatePresence mode="wait">
        {showing ? (
          <motion.div key="results" className="ax-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            {err && <Paused>{err}</Paused>}
            {busy && <Settling rows={3} />}
            {!busy && result && (
              <>
                <div className="ax-section-label"><span>{result.memories.length ? `${result.memories.length} ${result.memories.length === 1 ? 'memory' : 'memories'}` : 'Nothing held for that yet'}</span>
                  <span style={{ letterSpacing: '0.08em', textTransform: 'none' }}>{result.signals?.includes('semantic') ? 'by meaning and words' : 'by words'}</span></div>
                {result.inferences?.length > 0 && result.memories.length > 0 && (
                  <div className="ax-card" style={{ borderColor: 'rgba(255,183,51,0.14)' }}>
                    <div className="ax-eyebrow" style={{ color: 'var(--color-accent)' }}>What AXON concluded</div>
                    {result.inferences.slice(0, 2).map((i) => <div key={i.id} className="ax-card-body" style={{ WebkitLineClamp: 2 }}>{i.statement}</div>)}
                  </div>
                )}
                <div className="ax-list">
                  {result.memories.map((m, i) => <MemoryCard key={m.id} m={m} index={i} threadName={m.thread?.key && home?.threads.find((t) => t.key === m.thread.key)?.name} />)}
                </div>
                {!result.memories.length && (
                  <div className="ax-young">Nothing about <strong>{result.query || facet}</strong> has been captured yet. <button className="ax-btn-quiet" style={{ marginLeft: 6 }} onClick={() => onOpen?.('capture', { text: q })}>Capture it now</button></div>
                )}
              </>
            )}
          </motion.div>
        ) : (
          <motion.div key="home" style={{ display: 'flex', flexDirection: 'column', gap: 26 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            {!home && <Settling rows={3} />}
            {home && home.total === 0 && (
              <div className="ax-young">
                <strong>Your Core is young.</strong> Capture something worth keeping, or connect an AI or a source — everything they keep lands here, recallable from any of them.
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="ax-btn" onClick={() => onOpen?.('capture')}>Capture</button>
                  <button className="ax-btn-quiet" onClick={() => onOpen?.('connections')}>Connect an AI</button>
                </div>
              </div>
            )}
            {home && home.total > 0 && (
              <>
                {home.activeBy.length > 0 && (
                  <div className="ax-meta" style={{ fontSize: 12.5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--color-accent)', boxShadow: '0 0 12px rgba(255,183,51,0.6)' }} />
                    <span>Recalled this week by <b>{home.activeBy.map(providerName).join(', ')}</b></span>
                    <span>· {home.total} {home.total === 1 ? 'memory' : 'memories'} held</span>
                  </div>
                )}
                {home.threads.length > 0 && (
                  <div className="ax-section">
                    <div className="ax-section-label"><span>Your Threads</span><button className="ax-btn-quiet" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => onOpen?.('threads')}>All</button></div>
                    <div className="ax-chips" style={{ gap: 10 }}>
                      {home.threads.slice(0, 6).map((t) => (
                        <button key={t.id} className="ax-card" onClick={() => onOpen?.('threads', { thread: t.key })} style={{ width: 210, flexShrink: 0, padding: '14px 14px 12px', cursor: 'pointer' }}>
                          <div className="ax-card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name || t.key}</div>
                          <div className="ax-card-body" style={{ WebkitLineClamp: 2, minHeight: 42 }}>{t.last?.title || t.last?.content || 'Waiting for its first memory.'}</div>
                          <div className="ax-meta"><span>{t.n || 'no'} recent</span>{t.last && <span>{ago(t.last.occurred_at)}</span>}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {home.strengthened.length > 0 && (
                  <div className="ax-section">
                    <div className="ax-section-label"><span>Recently strengthened</span></div>
                    <div className="ax-list">
                      {home.strengthened.map((s, i) => (
                        <div key={s.memory_item_id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <MemoryCard m={{ ...s.m, weight: s.weight }} index={i} threadName={home.threadName.get(s.m.project_id)} />
                          <div className="ax-meta" style={{ paddingLeft: 6 }}>Recalled by <b>{providerName(s.by) || 'an AI'}</b> {ago(s.at)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="ax-section">
                  <div className="ax-section-label"><span>Just captured</span></div>
                  <div className="ax-list">{home.recent.map((m, i) => <MemoryCard key={m.id} m={m} index={i} threadName={home.threadName.get(m.project_id)} />)}</div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
