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

// The four providers with a real OAuth backend (source_connections).
const REAL_SOURCE_IDS = ['gmail', 'github', 'notion', 'slack'];

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

const OFFLINE = MAPPED_SOURCES.map((s) => ({ ...s, count: 0, status: 'OFFLINE' }));

function useRealBeaconData() {
  const { user, isDemo } = useAuth();
  const [state, setState] = useState({ sources: OFFLINE, totalItems: 0 });

  useEffect(() => {
    if (isDemo || !user || !isSupabaseConfigured) return;

    let cancelled = false;
    async function load() {
      // `source_connections` has no item_count column, so the per-provider
      // memory totals are counted straight off `memory_items.source_type`.
      const [sourceRes, itemsRes, keysRes, ...perProvider] = await Promise.all([
        supabase.from('source_connections').select('provider, status').eq('user_id', user.id),
        supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase
          .from('api_keys')
          .select('id, name')
          .eq('user_id', user.id)
          .is('revoked_at', null)
          .not('oauth_client_id', 'is', null),
        ...REAL_SOURCE_IDS.map((p) =>
          supabase
            .from('memory_items')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('source_type', p),
        ),
        // Every summit now measures the same thing: what that source or
        // assistant put into the graph. Adapters used to be given the account
        // total, so four of them stood at identical height and clicking one
        // opened everything the account held.
        ...ADAPTER_IDS.map((a) => {
          const via = rememberedViaFilter(a);
          const q = supabase
            .from('memory_items')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id);
          return via ? q.or(via) : q;
        }),
      ]);
      if (cancelled) return;

      const byProvider = Object.fromEntries((sourceRes.data || []).map((r) => [r.provider, r]));
      const countByProvider = Object.fromEntries(
        REAL_SOURCE_IDS.map((p, i) => [p, perProvider[i]?.count ?? 0]),
      );
      const countByAdapter = Object.fromEntries(
        ADAPTER_IDS.map((a, i) => [a, perProvider[REAL_SOURCE_IDS.length + i]?.count ?? 0]),
      );
      const totalItems = itemsRes.count ?? 0;
      const adapterNames = (keysRes.data || []).map((k) => k.name || '');

      const sources = MAPPED_SOURCES.map((s) => {
        if (REAL_SOURCE_IDS.includes(s.id)) {
          const row = byProvider[s.id];
          return {
            ...s,
            count: countByProvider[s.id] ?? 0,
            status: row ? String(row.status).toUpperCase() : 'OFFLINE',
          };
        }
        // Height is contribution, the same as it is for a source: what this
        // assistant has written into the graph. Being connected is carried by
        // the status, not by borrowing the account total.
        const pattern = ADAPTER_PATTERNS[s.id];
        const connected = pattern ? adapterNames.some((n) => pattern.test(n)) : false;
        return {
          ...s,
          count: countByAdapter[s.id] ?? 0,
          status: connected ? 'ONLINE' : 'OFFLINE',
        };
      });

      setState({ sources, totalItems });
    }

    load();
    return () => {
      cancelled = true;
    };
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
        if (REAL_SOURCE_IDS.includes(hubId)) {
          q = q.eq('source_type', hubId);
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
