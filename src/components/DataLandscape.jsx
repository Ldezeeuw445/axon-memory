/**
 * DataLandscape - AXON's volumetric memory terrain.
 *
 * The visual layer is the AXE CORE HQ terrain (src/components/terrain/*),
 * adopted wholesale because it is the better-looking of the two: lit rock
 * mountains with real shadows, gold wireframe summit caps, beacon beams,
 * a cinematic rise-in and a fly-to camera rig.
 *
 * The DATA is entirely AXON's own — live `source_connections`,
 * `memory_items` and `api_keys` rows for the signed-in user. Nothing here is
 * simulated: a provider with no connection shows OFFLINE with zero memories.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DATA_SOURCES, AI_PROVIDERS } from '../lib/logos';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import MemoryTerrainMap, { hubsFromAxonSources } from './terrain/MemoryTerrainMap';

// Label/type table for the terrain summits. Positions are no longer listed
// here — the terrain engine lays hubs out on its own rings and sizes each
// summit from its real memory count.
const MAPPED_SOURCES = [
  { id: 'gmail', name: 'GMAIL', icon: DATA_SOURCES.find((s) => s.id === 'gmail')?.Logo, type: 'source' },
  { id: 'github', name: 'GITHUB', icon: DATA_SOURCES.find((s) => s.id === 'github')?.Logo, type: 'source' },
  { id: 'notion', name: 'NOTION', icon: DATA_SOURCES.find((s) => s.id === 'notion')?.Logo, type: 'source' },
  { id: 'slack', name: 'SLACK', icon: DATA_SOURCES.find((s) => s.id === 'slack')?.Logo, type: 'source' },
  { id: 'openai', name: 'CHATGPT', icon: AI_PROVIDERS.find((s) => s.id === 'openai')?.Logo, type: 'ai' },
  { id: 'anthropic', name: 'CLAUDE', icon: AI_PROVIDERS.find((s) => s.id === 'anthropic')?.Logo, type: 'ai' },
  { id: 'cursor', name: 'CURSOR', icon: AI_PROVIDERS.find((s) => s.id === 'cursor')?.Logo, type: 'ai' },
  { id: 'perplexity', name: 'PERPLEXITY', icon: AI_PROVIDERS.find((s) => s.id === 'perplexity')?.Logo, type: 'ai' },
  { id: 'grok', name: 'GROK', icon: AI_PROVIDERS.find((s) => s.id === 'grok')?.Logo, type: 'ai' },
];


// An MCP client names itself when it registers (client_name), so a connected
// adapter can be matched back to its summit. Without this the terrain had one
// boolean for all four — connect Claude, and Cursor and Perplexity lit up too.
// What an assistant wrote is recorded on the memory as metadata.remembered_via,
// carrying the name the MCP client registered under. Adapter summits filter on
// it, so Claude's column is what Claude saved and Cursor's is what Cursor saved.
// Without this every adapter fell through unfiltered and showed the whole
// account — which, with GitHub holding most of it, looked like every summit was
// GitHub.
const ADAPTER_IDS = ['openai', 'anthropic', 'cursor', 'perplexity', 'grok'];

const ADAPTER_LABELS = {
  openai: ['chatgpt', 'openai', 'gpt'],
  anthropic: ['claude', 'anthropic'],
  cursor: ['cursor'],
  perplexity: ['perplexity'],
  grok: ['grok', 'xai'],
};

/** PostgREST or-filter matching any of an adapter's registered names. */
export function rememberedViaFilter(hubId) {
  const tokens = ADAPTER_LABELS[hubId];
  if (!tokens) return null;
  return tokens.map((t) => `metadata->>remembered_via.ilike.*${t}*`).join(',');
}

const ADAPTER_PATTERNS = {
  openai: /chatgpt|openai|gpt/i,
  anthropic: /claude|anthropic/i,
  cursor: /cursor/i,
  perplexity: /perplexity/i,
  grok: /grok|xai/i,
};


const LABEL = { manual: 'YOU', app: 'YOU' };
const iconFor = (id) => DATA_SOURCES.find((s) => s.id === id)?.Logo || AI_PROVIDERS.find((s) => s.id === id)?.Logo;

/**
 * Summits are built from what the account actually holds: every source_type
 * with memories (memory_source_breakdown, RLS-scoped), plus any connected
 * provider that has not delivered yet. Captures made by the person
 * themselves (source_type 'manual') stand as "YOU". AI summits appear only for
 * an AI that is connected or has written something — an unconnected
 * "CHATGPT · 0" peak is decoration, not data.
 */
function useRealBeaconData() {
  const { user, isDemo } = useAuth();
  const [state, setState] = useState({ sources: [], totalItems: 0 });

  useEffect(() => {
    if (isDemo || !user || !isSupabaseConfigured) return;
    let cancelled = false;
    async function load() {
      const [breakdownRes, sourceRes, keysRes, ...adapterCounts] = await Promise.all([
        supabase.rpc('memory_source_breakdown', { p_user_id: user.id }),
        supabase.from('source_connections').select('provider, status').eq('user_id', user.id),
        supabase.from('api_keys').select('id, name').eq('user_id', user.id).is('revoked_at', null).not('oauth_client_id', 'is', null),
        ...ADAPTER_IDS.map((a) => supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).or(rememberedViaFilter(a))),
      ]);
      if (cancelled) return;
      const counts = Object.fromEntries((breakdownRes.data || []).map((r) => [r.source_type, Number(r.item_count) || 0]));
      const conn = Object.fromEntries((sourceRes.data || []).map((r) => [r.provider, r]));
      const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
      const adapterNames = (keysRes.data || []).map((k) => k.name || '');
      const ids = [...new Set([...Object.keys(counts), ...Object.keys(conn)])].filter((id) => id && id !== 'app');
      if (counts.app) counts.manual = (counts.manual || 0) + counts.app;
      const sources = ids.map((id) => ({
        id, name: LABEL[id] || (DATA_SOURCES.find((d) => d.id === id)?.name || id).toUpperCase(), icon: iconFor(id), type: 'source',
        count: counts[id] || 0, status: conn[id] ? String(conn[id].status).toUpperCase() : 'ACTIVE',
      }));
      ADAPTER_IDS.forEach((a, i) => {
        const count = adapterCounts[i]?.count ?? 0;
        const connected = adapterNames.some((n) => ADAPTER_PATTERNS[a].test(n));
        if (!connected && !count) return;
        const meta = MAPPED_SOURCES.find((m) => m.id === a);
        sources.push({ ...meta, count, status: connected ? 'ONLINE' : 'OFFLINE' });
      });
      setState({ sources, totalItems });
    }
    load();
    return () => { cancelled = true; };
  }, [user, isDemo]);

  return state;
}

/**
 * Real memories for the focused summit, shown as the leaf ring around it.
 * Provider summits get that provider's items; the AXON core summit gets the
 * most recent items across every source.
 */
function useLeavesForHub(hubId) {
  const { user, isDemo } = useAuth();
  // Tagged with the hub it belongs to. Holding a bare array meant that between
  // clicking a new summit and its query returning, the previous summit's
  // memories were still in state and still being drawn — so opening Claude
  // showed GitHub's column until the fetch landed. Carrying the id makes a
  // mismatch impossible to render rather than merely brief.
  const [leaves, setLeaves] = useState({ hubId: null, items: [] });

  useEffect(() => {
    if (!hubId || isDemo || !user || !isSupabaseConfigured) {
      setLeaves({ hubId: null, items: [] });
      return;
    }

    let cancelled = false;
    async function load() {
      let q = supabase
        .from('memory_items')
        .select('id, title, content, source_type, occurred_at')
        .eq('user_id', user.id)
        .order('occurred_at', { ascending: false })
        // Was 8. A summit whose label reads "164 memories" and then opens onto
        // eight of them is telling two different stories. The column is meant
        // to be the whole source; the ceiling is here only so a pathological
        // account cannot pull an unbounded result set into the browser.
        .limit(500);

      if (hubId !== 'axon-core') {
        if (!ADAPTER_IDS.includes(hubId)) {
          q = hubId === 'manual' ? q.in('source_type', ['manual', 'app']) : q.eq('source_type', hubId);
        } else {
          const via = rememberedViaFilter(hubId);
          // An assistant with no filter of its own would show the whole
          // account, so an unknown hub shows nothing rather than everything.
          q = via ? q.or(via) : q.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      }

      const { data } = await q;
      if (cancelled) return;

      setLeaves({
        hubId,
        items: (data || []).map((row) => ({
          id: row.id,
          label: row.title || (row.content || '').slice(0, 40) || 'Memory',
          detail: row.source_type,
          occurred_at: row.occurred_at,
          source: row,
        })),
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hubId, user, isDemo]);

  return leaves;
}

export default function DataLandscape({ onNodeSelect, onMemorySelect }) {
  const { sources, totalItems } = useRealBeaconData();
  const [focusHubId, setFocusHubId] = useState(null);

  const hubs = useMemo(() => hubsFromAxonSources(sources, totalItems), [sources, totalItems]);
  const leaves = useLeavesForHub(focusHubId);

  const handleFocusHub = useCallback(
    (id) => {
      setFocusHubId(id);
      if (id && id !== 'axon-core') onNodeSelect?.(id);
    },
    [onNodeSelect],
  );

  const handleBackground = useCallback(() => setFocusHubId(null), []);

  return (
    <MemoryTerrainMap
      hubs={hubs}
      focusHubId={focusHubId}
      onFocusHub={handleFocusHub}
      onSelectLeaf={(item) => onMemorySelect?.(item)}
      onBackground={handleBackground}
      leaves={leaves}
      autoRotate={!focusHubId}
    />
  );
}
