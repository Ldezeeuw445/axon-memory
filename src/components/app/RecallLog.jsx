import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ago, providerName } from './ui';

/**
 * Every memory an AI has read, by whom, and how often (adapted from
 * axon-memory-app RecallLog.jsx). The strongest thing AXON can say about what
 * it does with your memory is a list of what it actually did. Reads with no
 * named client are shown and labelled as such, not left out.
 */
const PAGE = 25;
export default function RecallLog({ userId }) {
  const [rows, setRows] = useState(null);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('memory_recalls').select('id, memory_item_id, client_label, last_recalled_at, recall_count')
        .eq('user_id', userId).order('last_recalled_at', { ascending: false }).limit(200);
      const ids = [...new Set((data || []).map((r) => r.memory_item_id))];
      const { data: mems } = ids.length ? await supabase.from('memory_items').select('id, title, content').in('id', ids) : { data: [] };
      const byId = new Map((mems || []).map((m) => [m.id, m]));
      setRows((data || []).map((r) => ({ ...r, memory: byId.get(r.memory_item_id) })));
    })();
  }, [userId]);
  if (rows === null) return null;
  if (!rows.length) return <div className="ax-meta" style={{ display: 'block' }}>No AI has read your memory yet. When one does, every read is listed here.</div>;
  return (
    <div className="ax-card" style={{ gap: 0, padding: '4px 16px' }}>
      {rows.slice(0, shown).map((r) => (
        <div key={r.id} className="ax-kv" style={{ alignItems: 'flex-start' }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.memory ? (r.memory.title || r.memory.content) : 'A memory since deleted'}</span>
            <span className="ax-meta">{r.client_label ? providerName(r.client_label) : 'No named client (the app or a direct call)'}{r.recall_count > 1 ? ` · ${r.recall_count} times` : ''}</span>
          </span>
          <span className="ax-meta" style={{ whiteSpace: 'nowrap' }}>{ago(r.last_recalled_at)}</span>
        </div>
      ))}
      {rows.length > shown && <button className="ax-btn-quiet" style={{ margin: '10px 0' }} onClick={() => setShown((n) => n + PAGE)}>Show more</button>}
    </div>
  );
}
