import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';

const PROVIDER_NAMES = {
  gmail: 'Gmail', outlook: 'Outlook', github: 'GitHub', notion: 'Notion', slack: 'Slack', linear: 'Linear',
  google_drive: 'Google Drive', supabase: 'Supabase', manual: 'You', claude: 'Claude', chatgpt: 'ChatGPT',
  gemini: 'Gemini', cursor: 'Cursor', grok: 'Grok', perplexity: 'Perplexity',
};
export const providerName = (k) => PROVIDER_NAMES[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ') : 'Unknown');

export function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d > 330 ? 'numeric' : undefined });
}

/** Where a memory came from, in one short phrase. Works for /v1 memories and raw rows. */
export function sourceLine(m) {
  const s = m.source;
  if (s) {
    if (s.channel === 'connector') return `${providerName(s.provider || s.type)}${s.account ? ` · ${s.account}` : ''}`;
    if (s.channel === 'agent') return s.client || s.app ? providerName(s.client || s.app) : 'An AI you connected';
    if (s.channel === 'direct') return s.app && s.app !== 'manual' ? providerName(s.app) : 'You';
    return providerName(s.type);
  }
  if (m.source_connection_id) return providerName(m.source_type);
  if (m.api_key_id) return m.metadata?.remembered_via ? providerName(m.metadata.remembered_via) : 'An AI you connected';
  return m.metadata?.remembered_via ? providerName(m.metadata.remembered_via) : 'You';
}

/** Weight is felt, never a number: up to four marks. */
export function Weight({ value = 0 }) {
  const n = Math.max(0, Math.min(4, Math.round(value * 4)));
  return (
    <span className="ax-weight" aria-label="weight" title="Weight">
      {[0, 1, 2, 3].map((i) => <i key={i} className={i < n ? 'on' : ''} style={{ height: 4 + i * 2 }} />)}
    </span>
  );
}

export function FacetHead({ eyebrow, title, sub, right }) {
  return (
    <div className="ax-facet-head" style={{ flexDirection: right ? 'row' : 'column', alignItems: right ? 'flex-end' : undefined, justifyContent: 'space-between', gap: right ? 12 : 6 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {eyebrow && <div className="ax-eyebrow">{eyebrow}</div>}
        <h2 className="ax-title">{title}</h2>
        {sub && <p className="ax-sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Settling({ rows = 3, label }) {
  return (
    <div className="ax-list" aria-busy="true">
      {label && <div className="ax-meta" role="status" style={{ fontSize: 12.5, opacity: 0.7 }}>{label}</div>}
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="ax-settle" style={{ animationDelay: `${i * 0.25}s` }} />)}
    </div>
  );
}

export function Paused({ children }) {
  return <div className="ax-paused" role="status"><span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--color-accent)', marginTop: 7, flexShrink: 0, opacity: 0.8 }} />{children}</div>;
}

/** One memory as a readable object. Opens in place; never navigates away. */
export function MemoryCard({ m, threadName, onAction, index = 0 }) {
  const [open, setOpen] = useState(false);
  const retired = m.state === 'retired' || !!m.retired_at;
  const url = m.source?.url || m.source?.ref?.url || m.metadata?.url;
  const at = m.source?.at || m.occurred_at || m.created_at;
  const weight = typeof m.weight === 'number' ? m.weight : (m.relevance?.score ?? 0.5);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: Math.min(index, 8) * 0.06, ease: [0.19, 1, 0.22, 1] }}>
      <div className="ax-card" style={{ opacity: retired ? 0.55 : 1 }}>
        <button onClick={() => setOpen((v) => !v)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }} aria-expanded={open}>
          {m.title && <div className="ax-card-title">{m.title}</div>}
          <div className={`ax-card-body${open ? ' is-open' : ''}`}>{m.content}</div>
        </button>
        <div className="ax-meta">
          <Weight value={weight} />
          <span><b>{sourceLine(m)}</b></span>
          {(threadName || m.thread?.key) && <span><span className="ax-thread-dot" style={{ marginRight: 5, verticalAlign: 1 }} />{threadName || m.thread.key}</span>}
          <span>{ago(at)}</span>
          {retired && <span>retired</span>}
          {url && <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--color-text-secondary)' }} onClick={(e) => e.stopPropagation()}><ExternalLink size={11} /> source</a>}
        </div>
        {open && (m.facets?.length > 0) && (
          <div className="ax-chips" style={{ marginTop: 2 }}>{m.facets.map((f) => <span key={f} className="ax-chip" style={{ padding: '5px 10px', fontSize: 12 }}>{f}</span>)}</div>
        )}
        {open && onAction && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {retired
              ? <button className="ax-btn-quiet" onClick={() => onAction('restore', m)}>Restore</button>
              : <button className="ax-btn-quiet" onClick={() => onAction('retire', m)}>Retire</button>}
            <button className="ax-btn-quiet" onClick={() => onAction('delete', m)}>Delete</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
