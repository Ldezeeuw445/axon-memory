import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MCP_GATEWAY_URL } from '../../lib/platformClients';

/**
 * The first recall (adapted from axon-memory-app FirstRecall.jsx).
 * "You're all set" is a promise; a row in memory_recalls is a fact. Until an AI
 * has actually read this memory, Recall offers one question to paste — one the
 * AI cannot answer from where it is — and quietly watches for the read to land.
 * Polls every 5 s while on screen; no spinner, because waiting is not failing.
 */
export const FIRST_QUESTION = 'Using my AXON memory, what have I been working on lately? Name the project and where you got it from.';
const EVERY_MS = 5000;

export default function FirstRecall({ userId, onArrived }) {
  const [recall, setRecall] = useState(null);
  const [copied, setCopied] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    const look = async () => {
      const { data } = await supabase.from('memory_recalls').select('client_label, last_recalled_at')
        .eq('user_id', userId).order('last_recalled_at', { ascending: false }).limit(1);
      if (!alive || !data?.length) return;
      setRecall(data[0]); clearInterval(timer.current); onArrived?.(data[0]);
    };
    look();
    timer.current = setInterval(look, EVERY_MS);
    return () => { alive = false; clearInterval(timer.current); };
  }, [userId]);

  const copy = (v, which) => { navigator.clipboard?.writeText(v); setCopied(which); setTimeout(() => setCopied(null), 1500); };

  if (recall) {
    return (
      <div className="ax-card">
        <div className="ax-card-title">{recall.client_label || 'An AI'} read your memory.</div>
        <div className="ax-card-body">That is the whole idea. Everything else is more of it.</div>
      </div>
    );
  }
  return (
    <div className="ax-card">
      <div className="ax-card-title">One question, and you will know it works.</div>
      <div className="ax-card-body" style={{ marginBottom: 12 }}>Add your memory's address to an AI you use, then ask it this. It was never told the answer.</div>
      <div className="ax-field" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, marginBottom: 8 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{MCP_GATEWAY_URL}</span>
        <button className="ax-icon-btn" aria-label="Copy the address" onClick={() => copy(MCP_GATEWAY_URL, 'url')}>{copied === 'url' ? <Check size={15} /> : <Copy size={15} />}</button>
      </div>
      <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,183,51,0.3)', background: 'rgba(255,183,51,0.05)', fontSize: 14.5, lineHeight: 1.55 }}>
        {FIRST_QUESTION}
        <div><button className="ax-btn-quiet" style={{ marginTop: 10 }} onClick={() => copy(FIRST_QUESTION, 'q')}>{copied === 'q' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy the question</>}</button></div>
      </div>
      <div className="ax-meta" style={{ display: 'block', marginTop: 10 }}>Waiting for the first read. It lands when you ask — in a minute or tomorrow.</div>
    </div>
  );
}
