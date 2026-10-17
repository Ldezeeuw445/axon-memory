import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Link2, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { axon, enqueueCapture, flushCaptureQueue, queuedCaptures } from '../../lib/axonApi';
import { FacetHead, Paused } from '../../components/app/ui';
import { useVoice } from '../../components/app/useVoice';

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;

/**
 * Capture is never gated by a form. Write, speak, paste or share — a Thread is
 * optional, a link is picked up on its own. Arrives from the share sheet with
 * ?title=&text=&url= (manifest share_target), and offline it is kept on the
 * device and sent when the connection returns.
 */
export default function CaptureFacet({ initial }) {
  const { user } = useAuth();
  const [text, setText] = useState(() => [initial?.title, initial?.text].filter(Boolean).join('\n\n'));
  const [link, setLink] = useState(initial?.url || '');
  const [showLink, setShowLink] = useState(!!initial?.url);
  const [thread, setThread] = useState(initial?.thread || null);
  const [threads, setThreads] = useState([]);
  const [state, setState] = useState(null); // {kind:'kept'|'queued'|'duplicate'|'paused', text}
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(queuedCaptures().length);
  const areaRef = useRef(null);
  const voice = useVoice((t) => setText((v) => (v ? `${v.trimEnd()} ${t}` : t)));

  useEffect(() => {
    if (!user) return;
    supabase.from('projects').select('id, key, name').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => setThreads(data || []));
  }, [user]);

  // Send anything kept offline the moment the connection is back.
  useEffect(() => {
    const flush = async () => { const n = await flushCaptureQueue(); if (n) setState({ kind: 'kept', text: `${n} kept while offline ${n === 1 ? 'is' : 'are'} now in your Core.` }); setPending(queuedCaptures().length); };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  const detected = useMemo(() => (!link && text.match(URL_RE)?.[0]) || null, [text, link]);
  const url = (link || detected || '').trim();

  const submit = async () => {
    const content = text.trim() || (url ? url : '');
    if (!content) { areaRef.current?.focus(); return; }
    const firstLine = content.split('\n')[0];
    const body = {
      content,
      ...(firstLine.length <= 90 && content.includes('\n') ? { title: firstLine } : {}),
      ...(thread ? { thread } : {}),
      ...(url && /^https?:\/\//i.test(url) ? { source: { ref: { url } } } : {}),
      idempotency_key: `app:${crypto.randomUUID()}`,
    };
    setBusy(true); setState(null);
    try {
      const r = await axon.capture(body);
      setState(r.duplicate ? { kind: 'duplicate', text: 'Already in your Core — nothing kept twice.' } : { kind: 'kept', text: thread ? `Kept in ${threads.find((t) => t.key === thread)?.name || thread}.` : 'Kept.' });
      setText(''); setLink(''); setShowLink(false);
    } catch (e) {
      if (e.status === 0) {
        enqueueCapture(body); setPending(queuedCaptures().length);
        setState({ kind: 'queued', text: 'Kept on this device. It reaches your Core when the connection returns.' });
        setText(''); setLink(''); setShowLink(false);
      } else {
        setState({ kind: 'paused', text: e.message });
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="ax-facet">
      <FacetHead eyebrow="Capture" title="Keep it before it slips." sub="Write it, say it, or share it here from any app. Every AI you connect can recall it." />

      <div style={{ position: 'relative' }}>
        <textarea ref={areaRef} className="ax-field" value={text} onChange={(e) => setText(e.target.value)} autoFocus={!initial?.noFocus}
          placeholder="We decided to keep the API layer separate from orchestration…" aria-label="What to keep"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} style={{ minHeight: 170, paddingBottom: 54 }} />
        <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', gap: 4, alignItems: 'center' }}>
          {voice.supported && (
            <button type="button" className={`ax-icon-btn${voice.listening ? ' is-live' : ''}`} onClick={voice.toggle} aria-label={voice.listening ? 'Stop listening' : 'Speak'}><Mic size={18} /></button>
          )}
          <button type="button" className={`ax-icon-btn${showLink ? ' is-live' : ''}`} onClick={() => setShowLink((v) => !v)} aria-label="Add a link"><Link2 size={18} /></button>
          <span style={{ flex: 1 }} />
          {voice.listening && <span className="ax-meta" style={{ color: 'var(--color-accent-strong)' }}>Listening…</span>}
        </div>
      </div>

      <AnimatePresence>
        {(showLink || detected) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5 }}>
            {showLink
              ? <input className="ax-field" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// — a page, a document, an image" inputMode="url" aria-label="Link" />
              : <div className="ax-meta" style={{ fontSize: 12.5 }}><Link2 size={12} /> Source link picked up: <b style={{ wordBreak: 'break-all' }}>{detected}</b></div>}
          </motion.div>
        )}
      </AnimatePresence>

      {threads.length > 0 && (
        <div className="ax-section">
          <div className="ax-section-label"><span>Thread (optional)</span></div>
          <div className="ax-chips">
            <button className={`ax-chip${!thread ? ' is-on' : ''}`} onClick={() => setThread(null)}>None</button>
            {threads.map((t) => <button key={t.id} className={`ax-chip${thread === t.key ? ' is-on' : ''}`} onClick={() => setThread(t.key)}>{t.name || t.key}</button>)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="ax-btn" onClick={submit} disabled={busy || (!text.trim() && !url)} style={{ flex: 1 }}>{busy ? 'Keeping…' : 'Capture'}</button>
      </div>

      <AnimatePresence>
        {state && (
          <motion.div key={state.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            {state.kind === 'paused' ? <Paused>{state.text}</Paused> : <div className="ax-quiet-ok">{state.text}</div>}
          </motion.div>
        )}
      </AnimatePresence>
      {pending > 0 && <div className="ax-meta">{pending} waiting on this device for a connection.</div>}

      <div className="ax-young" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Share2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>From any app: <strong>Share → AXON</strong> (install AXON to your home screen first). Documents and images are kept as a link to where they live.</span>
      </div>
    </div>
  );
}
