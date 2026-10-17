// AXON public API, version 1 (A7-1).
//
// One stable, versioned contract over the same core every other surface uses:
// capture() for writes (A2-1), recall_hybrid + the A3-1 trace for reads, and
// the A4-1 lifecycle functions. Nothing here talks to a table the MCP server
// does not also go through. A second door must not become a second rulebook.
//
// Contract rules (also in docs/API.md):
//   - Paths are versioned (/v1/...). Additive changes only within v1.
//   - Auth: Authorization: Bearer <personal key | OAuth access token>.
//   - Success bodies are the resource itself. Errors are always
//     { error: { code, message, retryable, ...context } } with a matching status.
//   - Every memory, wherever it appears, has the same shape (ApiMemory).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { capture, captureStatus, type CaptureOutcome, retryCapture } from "./capture.ts";
import { deleteMemory, LifecycleError, restoreMemory, retireMemory, supersedeMemory } from "./lifecycle.ts";
import { lifecycleStateOf, normalizeFacets } from "./domain.ts";
import { embedQuery } from "./embeddings.ts";
import { recordRecalls, resolveProjectId } from "./memory-core.ts";
import { confidenceOf, inferenceOf, relevanceOf, sourceOf, type HybridRow, type TraceMaps } from "./recall.ts";
import { planDisplayName } from "./plans.ts";

export const API_VERSION = "v1";
export const API_BUILD = "1.0.0";

export type ApiErrorCode =
  | "unauthorized" | "forbidden_scope" | "not_found" | "invalid" | "method_not_allowed"
  | "rate_limited" | "conflict" | "gone" | "capture_failed" | "server_error";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly retryable = false,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
  body() {
    return { error: { code: this.code, message: this.message, retryable: this.retryable, ...this.extra } };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "/functions/v1/api-v1/v1/memories/x" or "/v1/memories/x" → ["memories", "x"]. */
export function routeOf(pathname: string): string[] {
  const parts = pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("v1");
  const fn = parts.indexOf("api-v1");
  const start = i >= 0 && i > fn ? i + 1 : fn >= 0 ? fn + 1 : 0;
  return parts.slice(start);
}

export function canWrite(scope: string | null | undefined): boolean {
  if (!scope || !scope.trim()) return true;
  return scope.split(/[\s,]+/).includes("memory.write");
}

export function requireId(v: string | undefined, what = "memory"): string {
  if (!v || !UUID.test(v)) throw new ApiError(400, "invalid", `${what} id must be a uuid`);
  return v.toLowerCase();
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface MemoryRow {
  id: string;
  title: string | null;
  content: string;
  content_type: string | null;
  project_id: string | null;
  facets: string[] | null;
  source_type: string;
  origin_key: string | null;
  source_connection_id: string | null;
  api_key_id: string | null;
  capture_channel: string | null;
  occurred_at: string | null;
  created_at: string;
  updated_at: string | null;
  retired_at: string | null;
  retired_reason: string | null;
  superseded_by: string | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
}

export const MEMORY_COLUMNS =
  "id, title, content, content_type, project_id, facets, source_type, origin_key, source_connection_id, api_key_id, " +
  "capture_channel, occurred_at, created_at, updated_at, retired_at, retired_reason, superseded_by, confidence, metadata";

function sourceRefOf(meta: Record<string, unknown> | null) {
  const r = (meta?.source_ref ?? null) as { id?: string | null; url?: string | null } | null;
  if (!r || (!r.id && !r.url)) return null;
  return { id: r.id ?? null, url: r.url ?? null };
}

/** The one memory shape (GET, capture result, recall item). */
export function apiMemory(row: MemoryRow & Partial<Omit<HybridRow, keyof MemoryRow>>, maps: TraceMaps = {}, withRelevance = false) {
  const hybrid = row as unknown as HybridRow;
  const threadKey = row.project_id ? maps.threads?.get(row.project_id) ?? null : null;
  return {
    id: row.id,
    kind: "memory" as const,
    title: row.title,
    content: row.content,
    content_type: row.content_type ?? null,
    state: lifecycleStateOf(row.retired_at, row.retired_reason),
    ...(row.superseded_by ? { superseded_by: row.superseded_by } : {}),
    thread: row.project_id ? { id: row.project_id, key: threadKey } : null,
    facets: row.facets ?? [],
    source: {
      ...sourceOf(hybrid, maps),
      connection_id: row.source_connection_id ?? null,
      api_key_id: row.api_key_id ?? null,
      ref: sourceRefOf(row.metadata),
    },
    // A stated memory (confidence NULL) vs an inference never gets blurred.
    stated: row.confidence == null,
    confidence: confidenceOf(hybrid).level,
    ...(withRelevance ? { relevance: relevanceOf(hybrid) } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

export type ApiMemory = ReturnType<typeof apiMemory>;

export function apiCaptureOutcome(o: CaptureOutcome) {
  if (o.ok) {
    return {
      status: 201,
      body: { memory_id: o.id, capture_id: o.capture_id, status: o.status, duplicate: o.status === "duplicate", index: o.index, created_at: o.created_at },
    };
  }
  const code: ApiErrorCode = o.code === "invalid" ? "invalid" : o.code === "deleted" ? "gone" : o.code === "in_progress" ? "conflict"
    : o.code === "no_owner" ? "unauthorized" : o.code === "not_found" ? "not_found" : "capture_failed";
  throw new ApiError(o.http, code, o.error, o.retryable, { capture_id: o.capture_id, stage: o.stage });
}

// ── Data access (service role, every query filtered on userId) ───────────────

type Admin = SupabaseClient;

export async function traceMapsFor(admin: Admin, userId: string, rows: Array<{ api_key_id?: string | null; project_id?: string | null; source_connection_id?: string | null }>): Promise<TraceMaps> {
  const keyIds = [...new Set(rows.map((r) => r.api_key_id).filter(Boolean))] as string[];
  const projIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
  const connIds = [...new Set(rows.map((r) => r.source_connection_id).filter(Boolean))] as string[];
  const none = Promise.resolve({ data: [] as never[] });
  const [{ data: keys }, { data: projs }, { data: conns }] = await Promise.all([
    keyIds.length ? admin.from("api_keys").select("id, name, display_name").eq("user_id", userId).in("id", keyIds) : none,
    projIds.length ? admin.from("projects").select("id, key").eq("user_id", userId).in("id", projIds) : none,
    connIds.length ? admin.from("source_connections").select("id, provider, external_account_label").eq("user_id", userId).in("id", connIds) : none,
  ]);
  return {
    clients: new Map((keys ?? []).map((k: { id: string; name: string | null; display_name: string | null }) => [k.id, k.display_name || k.name || "assistant"])),
    threads: new Map((projs ?? []).map((p: { id: string; key: string }) => [p.id, p.key])),
    connections: new Map((conns ?? []).map((c: { id: string; provider: string; external_account_label: string | null }) => [c.id, { provider: c.provider, account: c.external_account_label }])),
  };
}

export async function getMemory(admin: Admin, userId: string, id: string) {
  const { data, error } = await admin.from("memory_items").select(MEMORY_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new ApiError(500, "server_error", "could not read memory", true);
  if (!data) throw new ApiError(404, "not_found", "No memory with that id on this account.");
  const row = data as unknown as MemoryRow;
  return apiMemory(row, await traceMapsFor(admin, userId, [row]));
}

export async function recall(
  admin: Admin,
  userId: string,
  opts: { query?: unknown; thread?: unknown; facets?: unknown; limit?: unknown; include_inferences?: unknown },
  caller: { apiKeyId: string | null; clientLabel: string | null },
) {
  if (opts.query != null && typeof opts.query !== "string") throw new ApiError(400, "invalid", "query must be a string");
  if (opts.thread != null && typeof opts.thread !== "string") throw new ApiError(400, "invalid", "thread must be a thread key");
  const query = typeof opts.query === "string" && opts.query.trim() ? opts.query.trim().slice(0, 2000) : null;
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || 20));
  const facets = normalizeFacets(opts.facets).slice(0, 8);
  const threadKey = typeof opts.thread === "string" && opts.thread.trim() ? opts.thread.trim().toLowerCase() : null;
  const projectId = threadKey ? await resolveProjectId(admin, userId, threadKey) : null;
  if (threadKey && !projectId) throw new ApiError(404, "not_found", `No thread with key "${threadKey}" on this account.`);

  const { data: plan } = await admin.from("user_plan_status").select("has_semantic_search").eq("user_id", userId).maybeSingle();
  const vector = query && plan?.has_semantic_search ? await embedQuery(admin, userId, query) : null;
  const { data: ranked, error } = await admin.rpc("recall_hybrid", {
    p_user_id: userId, p_query: query, p_query_embedding: vector, p_project_id: projectId,
    p_facets: facets.length ? facets : null, p_limit: limit,
  });
  if (error) throw new ApiError(503, "server_error", "recall is temporarily unavailable", true);
  const rows = (ranked ?? []) as Array<MemoryRow & HybridRow>;
  // recall_hybrid returns the ranking columns; fill the lifecycle/meta columns the shape needs.
  const ids = rows.map((r) => r.id);
  const { data: extra } = ids.length
    ? await admin.from("memory_items").select("id, updated_at, created_at, retired_at, retired_reason, superseded_by, metadata, content_type").eq("user_id", userId).in("id", ids)
    : { data: [] };
  const byId = new Map((extra ?? []).map((e: Record<string, unknown>) => [e.id as string, e]));
  const merged = rows.map((r) => ({ ...r, ...(byId.get(r.id) ?? {}) })) as Array<MemoryRow & HybridRow>;
  const maps = await traceMapsFor(admin, userId, merged);

  let inferences: ReturnType<typeof inferenceOf>[] = [];
  if (opts.include_inferences !== false) {
    let fq = admin.from("memory_facts").select("id, statement, category, last_confirmed_at, source_item_ids, derived_by")
      .eq("user_id", userId).is("superseded_at", null);
    if (projectId) fq = fq.or(`project_id.eq.${projectId},project_id.is.null`);
    const { data: facts } = await fq.order("last_confirmed_at", { ascending: false }).limit(30);
    inferences = (facts ?? []).map((f: { id: string; category: string } & Parameters<typeof inferenceOf>[0]) => ({ id: f.id, category: f.category, ...inferenceOf(f) }));
  }
  await recordRecalls(admin, userId, ids, caller.clientLabel, caller.apiKeyId);
  return {
    query,
    thread: threadKey ? { id: projectId, key: threadKey } : null,
    facets,
    memories: merged.map((r) => apiMemory(r, maps, true)),
    inferences,
    signals: [...(query ? ["lexical", "fuzzy"] : []), ...(vector ? ["semantic"] : []), "recency", "weight", "provenance", ...(projectId ? ["thread"] : []), ...(facets.length ? ["facet"] : [])],
  };
}

export async function listThreads(admin: Admin, userId: string) {
  const { data, error } = await admin.from("projects").select("id, key, name, created_at").eq("user_id", userId).order("created_at");
  if (error) throw new ApiError(500, "server_error", "could not list threads", true);
  return { threads: (data ?? []).map((p: { id: string; key: string; name: string; created_at: string }) => ({ id: p.id, key: p.key, name: p.name, created_at: p.created_at })) };
}

export async function me(admin: Admin, userId: string, resolved: { apiKeyId: string | null; scope: string | null; viaOauthClient: boolean; clientLabel: string | null }) {
  const { data: profile } = await admin.from("profiles").select("plan_tier").eq("id", userId).maybeSingle();
  return {
    user_id: userId,
    plan: planDisplayName(profile?.plan_tier),
    token: { id: resolved.apiKeyId, kind: resolved.viaOauthClient ? "oauth" : "personal", client: resolved.clientLabel, scope: resolved.scope, can_write: canWrite(resolved.scope) },
    api_version: API_VERSION,
  };
}

export async function getCapture(admin: Admin, userId: string, id: string) {
  const { data } = await admin.from("capture_events")
    .select("id, status, stage, error, error_code, retryable, attempts, channel, client_label, memory_id, created_at, updated_at")
    .eq("user_id", userId).eq("id", id).maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "No capture with that id on this account.");
  return data;
}

export { captureStatus, capture, retryCapture };

export function lifecycleError(err: unknown): never {
  if (err instanceof LifecycleError) {
    const map = { not_found: [404, "not_found"], invalid: [400, "invalid"], forbidden: [403, "forbidden_scope"], failed: [500, "server_error"] } as const;
    const [status, code] = map[err.code];
    throw new ApiError(status, code, err.message, err.code === "failed");
  }
  throw err;
}

export const lifecycle = { retireMemory, restoreMemory, supersedeMemory, deleteMemory };
