// A3-1: what a recalled memory says about itself.
//
// The ranking happens in Postgres (public.recall_hybrid). This file turns a
// ranked row into something an assistant can reason about without guessing:
// it is a MEMORY (captured, not concluded), here is its SOURCE (channel,
// provider/app, account or client, when), how much to TRUST it (confidence)
// and why it came back (relevance + matched_by). Conclusions Axon drew itself
// (memory_facts) come out as INFERENCES that point at the memories they came
// from, so a generated conclusion never reads like something the user said.
// Pure functions only, so they are unit-tested without a database.

export type Channel = "direct" | "agent" | "connector" | "unknown";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface HybridRow {
  id: string;
  content_type: string;
  title: string | null;
  content: string;
  entities?: unknown;
  metadata?: Record<string, unknown> | null;
  occurred_at: string | null;
  created_at?: string | null;
  source_type: string;
  origin_key?: string | null;
  source_connection_id?: string | null;
  api_key_id?: string | null;
  project_id?: string | null;
  facets?: string[] | null;
  confidence?: number | null;
  capture_channel?: string | null;
  weight?: number | null;
  depth?: number | null;
  semantic?: number | null;
  lexical?: number | null;
  fuzzy?: number | null;
  recency?: number | null;
  thread_match?: boolean | null;
  facet_match?: boolean | null;
  score?: number | null;
  matched_by?: string[] | null;
}

export interface TraceMaps {
  connections?: Map<string, { provider: string; account: string | null }>;
  clients?: Map<string, string>; // api_key_id -> display name
  threads?: Map<string, string>; // project_id -> key
}

export function channelOf(row: Pick<HybridRow, "source_connection_id" | "api_key_id" | "source_type" | "capture_channel">): Channel {
  const c = row.capture_channel;
  if (c === "direct" || c === "agent" || c === "connector" || c === "unknown") return c;
  if (row.source_connection_id) return "connector";
  if (row.api_key_id) return "agent";
  if (row.source_type === "manual") return "direct";
  return "unknown";
}

const BASE_TRUST: Record<Channel, number> = { direct: 0.9, agent: 0.75, connector: 0.7, unknown: 0.5 };

export function levelOf(score: number): ConfidenceLevel {
  return score >= 0.8 ? "high" : score >= 0.6 ? "medium" : "low";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How far to trust what a memory says. This is about the statement, not
 * about whether it matched the question (that is relevance). An explicit
 * stored confidence wins; otherwise it comes from who put it here, how old it
 * is (Depth) and whether several assistants have relied on it (Weight).
 */
export function confidenceOf(row: HybridRow): { level: ConfidenceLevel; score: number; basis: string[] } {
  const ch = channelOf(row);
  const basis: string[] = [];
  let s: number;
  if (typeof row.confidence === "number") {
    s = row.confidence;
    basis.push("stated");
  } else {
    s = BASE_TRUST[ch];
    basis.push(ch === "direct" ? "user wrote it" : ch === "agent" ? "an assistant saved it" : ch === "connector" ? "imported from a connected account" : "origin unknown");
    const depth = row.depth ?? 0;
    if (depth >= 3) { s -= 0.15; basis.push("over a year old"); }
    else if (depth === 2) { s -= 0.05; basis.push("months old"); }
    if ((row.weight ?? 0) >= 4) { s += 0.05; basis.push("relied on by several assistants"); }
  }
  s = Math.min(1, Math.max(0, s));
  return { level: levelOf(s), score: round2(s), basis };
}

/** Where it came from, in the words an assistant can repeat to the user. */
export function sourceOf(row: HybridRow, maps: TraceMaps = {}) {
  const ch = channelOf(row);
  const conn = row.source_connection_id ? maps.connections?.get(row.source_connection_id) : undefined;
  const client = row.api_key_id ? maps.clients?.get(row.api_key_id) : undefined;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const url = typeof meta.url === "string" ? meta.url : typeof meta.html_url === "string" ? meta.html_url : undefined;
  return {
    channel: ch,
    type: row.source_type,
    ...(conn ? { provider: conn.provider, ...(conn.account ? { account: conn.account } : {}) } : {}),
    ...(client ? { client } : {}),
    ...(row.origin_key ? { app: row.origin_key } : {}),
    ...(url ? { url } : {}),
    at: row.occurred_at,
  };
}

export function relevanceOf(row: HybridRow) {
  return {
    score: round2(Math.max(0, Math.min(1, row.score ?? 0))),
    matched_by: row.matched_by ?? [],
    // A3-2: raw cosine similarity to the question (recall_hybrid's `semantic`),
    // when the question was embedded. Lets a caller see how close a match was.
    ...(typeof row.semantic === "number" ? { similarity: round2(row.semantic) } : {}),
  };
}

/** One recalled memory as it goes into a pack. */
export function traceMemory(row: HybridRow, maps: TraceMaps = {}) {
  const thread = row.project_id ? maps.threads?.get(row.project_id) : undefined;
  return {
    id: row.id,
    kind: "memory" as const,
    title: row.title,
    content: row.content,
    source: sourceOf(row, maps),
    confidence: confidenceOf(row).level,
    relevance: relevanceOf(row),
    ...(thread ? { thread } : {}),
    ...(row.facets && row.facets.length ? { facets: row.facets } : {}),
  };
}

export interface FactRow {
  id?: string;
  statement: string;
  category: string;
  source_item_ids?: string[] | null;
  derived_by?: string | null;
  last_confirmed_at?: string | null;
}

/**
 * A conclusion Axon drew. More independent sources -> more trust; staleness
 * costs trust. Never "high" unless at least two memories back it: one memory
 * read once is exactly how a wrong conclusion gets made.
 */
export function inferenceOf(f: FactRow, now = Date.now()) {
  const from = (f.source_item_ids ?? []).filter(Boolean);
  let s = 0.6 + Math.min(0.25, 0.1 * Math.max(0, from.length - 1));
  const days = f.last_confirmed_at ? (now - new Date(f.last_confirmed_at).getTime()) / 86_400_000 : 0;
  if (days > 180) s -= 0.15;
  else if (days > 60) s -= 0.05;
  if (from.length < 2) s = Math.min(s, 0.79);
  s = Math.min(1, Math.max(0, s));
  return {
    statement: f.statement,
    kind: "inference" as const,
    from: from.slice(0, 5),
    ...(from.length > 5 ? { from_total: from.length } : {}),
    ...(f.derived_by ? { derived_by: f.derived_by } : {}),
    confidence: levelOf(s),
  };
}

export const RECALL_LEGEND = {
  memory: "Something captured: written by the user, saved by an assistant, or imported from a connected account. `source` says which.",
  inference: "A conclusion Axon drew from memories. Not the user's own words; `from` lists the memory ids it rests on.",
  source: "channel = direct (user) | agent (an assistant, see client) | connector (provider/account); at = when it happened.",
  confidence: "How far to trust the statement itself (high/medium/low). Separate from relevance, which is how well it matched this question.",
};
