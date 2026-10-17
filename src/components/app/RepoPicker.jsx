import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { callFunction } from '../../lib/functions';
import { Settling, Paused, ago } from './ui';

/**
 * A8-3 — which GitHub repositories AXON reads, chosen by the person.
 * Each chosen repository becomes (or joins) a project on the terrain, so its
 * memories arrive already knowing what they are about. Stopping one only stops
 * future reads; nothing already kept is removed.
 */
export default function RepoPicker({ connection, onDone, onReconnect }) {
  const [data, setData] = useState(null);
  const [issue, setIssue] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    callFunction('github-repos', { method: 'GET', query: { connection_id: connection.id } })
      .then((res) => {
        if (!live) return;
        setData(res);
        setPicked(new Set((res.chosen || []).map((c) => c.full_name)));
      })
      .catch((err) => {
        if (!live) return;
        setIssue(err.code === 'reconnect'
          ? { text: 'GitHub no longer lets AXON in for this connection. Reconnect it, then choose.', reconnect: true }
          : { text: 'GitHub could not be reached just now. Nothing changed; try again in a moment.' });
      });
    return () => { live = false; };
  }, [connection.id]);

  const max = data?.max ?? 10;
  const chosen = new Set((data?.chosen || []).map((c) => c.full_name));
  const repos = useMemo(() => {
    const list = data?.repos || [];
    // Kept choices GitHub no longer lists stay visible, so they can be stopped.
    const listed = new Set(list.map((r) => r.full_name));
    const extra = (data?.chosen || []).filter((c) => !listed.has(c.full_name))
      .map((c) => ({ full_name: c.full_name, name: c.full_name.split('/')[1], private: false, pushed_at: null, gone: true }));
    const all = [...extra, ...list];
    const f = filter.trim().toLowerCase();
    return f ? all.filter((r) => r.full_name.toLowerCase().includes(f)) : all;
  }, [data, filter]);
  const projectOf = Object.fromEntries((data?.chosen || []).map((c) => [c.full_name, c.project_name]));

  const toggle = (full) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(full)) n.delete(full); else if (n.size < max) n.add(full);
    return n;
  });
  const changed = data && (picked.size !== chosen.size || [...picked].some((p) => !chosen.has(p)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await callFunction('github-repos', { body: { connection_id: connection.id, repos: [...picked] } });
      onDone?.(res);
    } catch (err) {
      setIssue({ text: err.status === 400 ? 'One of those repositories is not readable with this connection. Nothing changed.' : 'Keeping your choice was interrupted. Nothing changed; try again.' });
      setSaving(false);
    }
  };

  if (issue && !data) {
    return (
      <div style={{ marginTop: 12 }}>
        <Paused>{issue.text}</Paused>
        {issue.reconnect && <button className="ax-btn" style={{ marginTop: 10 }} onClick={() => onReconnect?.('github')}>Reconnect</button>}
      </div>
    );
  }
  if (!data) return <div style={{ marginTop: 12 }}><Settling rows={3} /></div>;

  return (
    <div className="ax-repo-picker" style={{ marginTop: 12 }}>
      <div className="ax-card-body" style={{ marginBottom: 10 }}>
        Choose up to {max}. Each becomes a project on your terrain, so what AXON keeps from it already knows what it is about.
      </div>
      {(data.repos || []).length > 8 && (
        <input className="ax-field" style={{ padding: '10px 14px', fontSize: 15, marginBottom: 8 }} placeholder="Find a repository" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a repository" />
      )}
      {repos.length === 0 ? (
        <div className="ax-young">{filter ? 'No repository by that name.' : 'GitHub lists no repositories for this connection.'}</div>
      ) : (
        <div role="list" style={{ maxHeight: 360, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
          {repos.map((r) => {
            const on = picked.has(r.full_name);
            const full = !on && picked.size >= max;
            return (
              <button key={r.full_name} role="listitem" type="button" className="ax-repo-row" data-on={on || undefined}
                onClick={() => toggle(r.full_name)} disabled={full} aria-pressed={on}>
                <span className="ax-repo-check" aria-hidden>{on && <Check size={13} strokeWidth={2.4} />}</span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span className="ax-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    {r.private && <Lock size={11} style={{ opacity: 0.5, flexShrink: 0 }} />}
                  </span>
                  <span className="ax-row-sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.full_name.split('/')[0]}
                    {r.gone ? ' · no longer listed by GitHub' : r.pushed_at ? ` · active ${ago(r.pushed_at)}` : ''}
                    {projectOf[r.full_name] ? ` · ${projectOf[r.full_name]}` : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {issue && data && <div style={{ marginTop: 10 }}><Paused>{issue.text}</Paused></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="ax-btn" onClick={save} disabled={!changed || saving}>{saving ? 'Keeping…' : 'Keep this choice'}</button>
        <span className="ax-meta">{picked.size} of {max} chosen{chosen.size && [...chosen].some((c) => !picked.has(c)) ? ' · stopping one keeps what it already brought' : ''}</span>
      </div>
    </div>
  );
}
