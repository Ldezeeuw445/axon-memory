import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { axon } from '../../lib/axonApi';
import { ago, Paused } from './ui';

/**
 * What has been withdrawn, and the two things you can do about it
 * (adapted from axon-memory-app RetiredMemories.jsx). Retiring without somewhere
 * to see what you retired makes the reversible act feel permanent. Restore and
 * delete go through /v1, so propagation is the same as everywhere else.
 */
export default function RetiredMemories({ userId }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [issue, setIssue] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('memory_items').select('id, title, content, retired_at')
      .eq('user_id', userId).not('retired_at', 'is', null).order('retired_at', { ascending: false }).limit(100);
    setRows(data || []);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const act = async (row, kind) => {
    setBusy(row.id); setIssue(null);
    try { if (kind === 'restore') await axon.restore(row.id); else await axon.remove(row.id); await load(); }
    catch { setIssue('That was interrupted before it finished. Nothing changed; try again.'); }
    finally { setBusy(null); setConfirming(null); }
  };

  if (rows === null) return null;
  if (!rows.length) return <div className="ax-meta" style={{ display: 'block' }}>Nothing retired. Retire a memory and it waits here, out of recall, until you restore or delete it.</div>;
  return (
    <div className="ax-list">
      {issue && <Paused>{issue}</Paused>}
      {rows.map((r) => (
        <div key={r.id} className="ax-card" style={{ padding: '12px 14px' }}>
          <div className="ax-card-body" style={{ WebkitLineClamp: 2 }}>{r.title || r.content}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="ax-meta" style={{ flex: 1 }}>Retired {ago(r.retired_at)}</span>
            <button className="ax-btn-quiet" disabled={busy === r.id} onClick={() => act(r, 'restore')}><RotateCcw size={13} /> Restore</button>
            {confirming === r.id
              ? <button className="ax-btn-quiet" disabled={busy === r.id} onClick={() => act(r, 'delete')} style={{ color: '#E8D3A8' }}>Delete for good</button>
              : <button className="ax-btn-quiet" disabled={busy === r.id} onClick={() => setConfirming(r.id)}>Delete…</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
