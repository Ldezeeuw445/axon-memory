// The single "brain" read/write path. context-pack (REST), mcp-server (MCP
// JSON-RPC tool calls), and remember (REST action for ChatGPT) all call the
// exact same functions here against the exact same `memory_items` table —
// which is *why* three different AI chats connected to the same Axon
// account see identical context: there is only ever one underlying store.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { embedAndStore, embedQuery } from "./embeddings.ts";

const CHARS_PER_TOKEN = 4; // rough heuristic, good enough for budgeting

export async function buildContextPack(
  admin: SupabaseClient,
  userId: string,
  opts: { query?: string | null; tokenBudget?: number; apiKeyId?: string | null } = {},
) {
  const query = opts.query?.trim() || null;
  const tokenBudget = Math.min(Math.max(opts.tokenBudget ?? 1500, 200), 8000);
  const charBudget = tokenBudget * CHARS_PER_TOKEN;

  const [{ data: profile }, { data: factRows }, { data: sources }, { data: planStatus }] = await Promise.all([
    admin.from("profiles").select("full_name, role, use_case, plan_tier").eq("id", userId).maybeSingle(),
    // Distilled conclusions. Cheap enough to always include in full: a few
    // dozen short statements against a budget the raw items would otherwise
    // consume entirely.
    admin
      .from("memory_facts")
      .select("statement, category, last_confirmed_at")
      .eq("user_id", userId)
      .is("superseded_at", null)
      .order("last_confirmed_at", { ascending: false })
      .limit(60),
    admin
      .from("source_connections")
      .select("provider, status, external_account_label, last_synced_at")
      .eq("user_id", userId),
    admin.from("user_plan_status").select("has_semantic_search").eq("user_id", userId).maybeSingle(),
  ]);

  let items: any[] = [];
  let searchMode: "semantic" | "keyword" | "recency" = "recency";

  if (query && planStatus?.has_semantic_search) {
    // Real vector similarity search (Ultra/Lifetime tiers). Falls through to
    // keyword search below if embedding the query fails for any reason
    // (missing key, provider hiccup) — semantic search degrading to keyword
    // search is fine; silently returning nothing would not be.
    const queryVector = await embedQuery(admin, userId, query);
    if (queryVector) {
      const { data: matches } = await admin.rpc("match_memory_items", {
        p_user_id: userId,
        p_query_embedding: queryVector,
        p_match_count: 60,
      });
      if (matches && matches.length > 0) {
        items = matches;
        searchMode = "semantic";
      }
    }
  }

  if (items.length === 0) {
    let itemsQuery = admin
      .from("memory_items")
      .select("id, content_type, title, content, entities, occurred_at, source_type")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(60);

    if (query) {
      // Searches title + content + entities through the expression the GIN
      // index in 0001_init.sql actually covers. Searching the `content`
      // column alone missed every memory whose subject only appears in its
      // title — which is most of them.
      itemsQuery = admin.rpc("search_memory_items", {
        p_user_id: userId,
        p_query: query,
        p_limit: 60,
      });
      searchMode = "keyword";
    }

    const { data } = await itemsQuery;
    items = data ?? [];
  }

  const grouped: Record<string, unknown[]> = {};
  let used = 0;
  let included = 0;
  for (const item of items) {
    const cost = (item.title?.length ?? 0) + item.content.length;
    if (used + cost > charBudget) continue;
    used += cost;
    included += 1;
    grouped[item.content_type] ??= [];
    grouped[item.content_type].push({
      title: item.title,
      content: item.content,
      source: item.source_type,
      occurred_at: item.occurred_at,
    });
  }

  const entitySet = new Set<string>();
  for (const item of items) {
    for (const e of item.entities ?? []) {
      if (typeof e === "string") entitySet.add(e);
    }
  }

  // Facts lead. An assistant opening cold needs "who is this and how do they
  // work" before it needs twenty commit messages, and until now the pack only
  // ever offered the second — which is why it read as search results rather
  // than as memory.
  const knownFacts: Record<string, string[]> = {};
  for (const f of factRows ?? []) {
    (knownFacts[f.category] ??= []).push(f.statement);
  }

  const pack = {
    profile: {
      name: profile?.full_name ?? null,
      role: profile?.role ?? null,
      use_case: profile?.use_case ?? null,
      plan: profile?.plan_tier ?? "starter",
    },
    session_objective: query ?? "general context",
    connected_sources: (sources ?? []).map((s) => ({
      provider: s.provider,
      status: s.status,
      account: s.external_account_label,
      last_synced_at: s.last_synced_at,
    })),
    // What is true about this person, grouped by kind.
    known: knownFacts,
    entities: Array.from(entitySet).slice(0, 40),
    // What it was drawn from, and everything not yet distilled.
    memory: grouped,
    stats: {
      items_returned: included,
      approx_tokens: Math.round(used / CHARS_PER_TOKEN),
      token_budget: tokenBudget,
      search_mode: searchMode,
    },
  };

  await admin.from("context_pack_logs").insert({
    user_id: userId,
    api_key_id: opts.apiKeyId ?? null,
    query,
    token_budget: tokenBudget,
    items_returned: included,
    approx_tokens_saved: Math.round(used / CHARS_PER_TOKEN),
  });

  return pack;
}

export async function rememberMemory(
  admin: SupabaseClient,
  userId: string,
  input: { content: string; title?: string | null; tags?: string[]; source_label?: string },
) {
  if (!input.content || !input.content.trim()) {
    throw new Error("content is required");
  }
  const row = {
    user_id: userId,
    source_connection_id: null,
    source_type: "manual" as const,
    content_type: "note" as const,
    external_id: null,
    title: input.title?.trim() || null,
    content: input.content.trim(),
    entities: input.tags ?? [],
    metadata: input.source_label ? { remembered_via: input.source_label } : {},
    occurred_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("memory_items").insert(row).select("id, created_at").single();
  if (error) throw new Error(error.message);

  // Best-effort — never let embedding failure block the save. The caller
  // already has their confirmation by the time this runs.
  embedAndStore(admin, userId, data.id, row.title, row.content).catch((err) =>
    console.error("rememberMemory: embedAndStore failed", err),
  );

  return data;
}

export async function listSourcesForUser(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("source_connections")
    .select("provider, status, external_account_label, last_synced_at")
    .eq("user_id", userId);
  return data ?? [];
}
