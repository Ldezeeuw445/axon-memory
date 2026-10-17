// A2-1: the capture pipeline. Every write of a new memory, whichever door it
// came through (MCP, REST, the app, an offline queue), runs the same stages:
//
//   receive -> normalize -> classify -> dedupe -> store -> link -> index
//
// and leaves one capture_events row saying which stage it reached, how long
// each took, and, if it failed, why and whether it can be retried. A failed
// attempt keeps its normalized payload so it can be retried server-side
// (retryCapture) or by resending with the same idempotency key, which is also
// what makes an offline/mobile queue safe to flush twice.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adapterKeyFromLabel, slugFromLabel } from "./adapters.ts";
import { normalizeContent, normalizeFacets } from "./domain.ts";
import { indexMemory } from "./embeddings.ts";

export const CAPTURE_CHANNELS = ["mcp", "rest", "app", "offline", "api", "connector"] as const;
export type CaptureChannel = typeof CAPTURE_CHANNELS[number];
export type CaptureStage = "receive" | "normalize" | "classify" | "dedupe" | "store" | "link" | "index" | "done";
export type CaptureKind = "decision" | "preference" | "task" | "fact";

export const LIMITS = { content: 20_000, title: 300, tags: 30, tag: 80, facets: 8, project: 40 } as const;
const KEY_PATTERN = /^[A-Za-z0-9._:\-]{8,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEDUPE_WINDOW_MS = 10 * 60_000;
const STALE_RECEIVED_MS = 2 * 60_000;
const INDEX_TIMEOUT_MS = 6_000;

export interface CaptureContext {
  userId: string;
  channel: CaptureChannel;
  apiKeyId?: string | null;
  clientLabel?: string | null;
}

export interface CaptureInput {
  content?: unknown;
  title?: unknown;
  tags?: unknown;
  facets?: unknown;
  project?: unknown;
  source_label?: string | null;
  idempotency_key?: unknown;
  occurred_at?: unknown;
}

export interface NormalizedCapture {
  content: string;
  title: string | null;
  tags: string[];
  facets: string[];
  project: string | null;
  source_label: string | null;
  idempotency_key: string | null;
  occurred_at: string;
}

export type CaptureOutcome =
  | {
    ok: true;
    status: "stored" | "indexed" | "duplicate";
    id: string;
    created_at: string | null;
    capture_id: string | null;
    index: "indexed" | "pending";
    attempts: number;
  }
  | {
    ok: false;
    status: "failed" | "in_progress";
    capture_id: string | null;
    stage: CaptureStage;
    code: "no_owner" | "no_provenance" | "invalid" | "deleted" | "in_progress" | "store_failed" | "not_found";
    error: string;
    retryable: boolean;
    http: number;
  };

// ── Pure stages (unit-tested) ────────────────────────────────────────────────

export function validateCapture(
  input: CaptureInput,
  now = Date.now(),
): { ok: true; value: NormalizedCapture } | { ok: false; error: string } {
  if (typeof input.content !== "string" || !input.content.trim()) return { ok: false, error: "content (string) is required" };
  const content = input.content.trim();
  if (content.length > LIMITS.content) return { ok: false, error: `content is longer than ${LIMITS.content} characters` };
  if (input.title != null && typeof input.title !== "string") return { ok: false, error: "title must be a string" };
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, LIMITS.title) : null;
  if (input.tags != null && !Array.isArray(input.tags)) return { ok: false, error: "tags must be an array of strings" };
  const tags = [...new Set(((input.tags as unknown[]) ?? [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, LIMITS.tag))
    .filter(Boolean))].slice(0, LIMITS.tags);
  const facets = normalizeFacets(input.facets).slice(0, LIMITS.facets);
  if (input.project != null && typeof input.project !== "string") return { ok: false, error: "project must be a key string" };
  const project = typeof input.project === "string" && input.project.trim()
    ? input.project.trim().toLowerCase().slice(0, LIMITS.project)
    : null;
  let idempotency_key: string | null = null;
  if (input.idempotency_key != null && input.idempotency_key !== "") {
    if (typeof input.idempotency_key !== "string" || !KEY_PATTERN.test(input.idempotency_key)) {
      return { ok: false, error: "idempotency_key must be 8-200 characters of A-Z a-z 0-9 . _ : -" };
    }
    idempotency_key = input.idempotency_key;
  }
  let occurred_at = new Date(now).toISOString();
  if (input.occurred_at != null && input.occurred_at !== "") {
    const t = typeof input.occurred_at === "string" ? Date.parse(input.occurred_at) : NaN;
    if (Number.isNaN(t)) return { ok: false, error: "occurred_at must be an ISO 8601 timestamp" };
    if (t > now + 86_400_000) return { ok: false, error: "occurred_at is in the future" };
    occurred_at = new Date(t).toISOString();
  }
  const source_label = typeof input.source_label === "string" && input.source_label.trim() ? input.source_label.trim().slice(0, 120) : null;
  return { ok: true, value: { content, title, tags, facets, project, source_label, idempotency_key, occurred_at } };
}

/** A light, honest label for what kind of statement this is. Never blocks a capture. */
export function classifyKind(content: string): CaptureKind {
  const c = content.toLowerCase();
  if (/\b(decided|we decided|decision|going with|we will|we'll|chose|agreed|settled on)\b/.test(c)) return "decision";
  if (/\b(prefer|prefers|always|never|i like|i don't like|i do not like|rather than)\b/.test(c)) return "preference";
  if (/\b(todo|to-do|need to|needs to|remember to|follow up|must do)\b/.test(c)) return "task";
  return "fact";
}

/** Where a capture says it came from, as the key the terrain groups by. */
export function originKeyFor(sourceLabel: string | null | undefined): string {
  if (!sourceLabel) return "manual";
  const key = adapterKeyFromLabel(sourceLabel);
  if (key !== "other") return key;
  return slugFromLabel(sourceLabel) ?? "manual";
}

export type ExistingEvent = { id: string; status: string; memory_id: string | null; attempts: number; updated_at: string };

/** What to do when a capture with this idempotency key was seen before. */
export function decideOnExisting(ev: ExistingEvent, now = Date.now()): "return" | "reindex" | "retry" | "in_progress" | "deleted" {
  if (ev.status === "indexed" || ev.status === "duplicate") return ev.memory_id ? "return" : "deleted";
  if (ev.status === "stored") return ev.memory_id ? "reindex" : "deleted";
  if (ev.status === "failed") return "retry";
  return now - Date.parse(ev.updated_at) > STALE_RECEIVED_MS ? "retry" : "in_progress";
}

// ── Orchestration ────────────────────────────────────────────────────────────

type Deps = { index?: typeof indexMemory; now?: () => number };

function failure(
  capture_id: string | null, stage: CaptureStage, code: Extract<CaptureOutcome, { ok: false }>["code"],
  error: string, retryable: boolean, http: number, status: "failed" | "in_progress" = "failed",
): CaptureOutcome {
  return { ok: false, status, capture_id, stage, code, error, retryable, http };
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  try { return await Promise.race([p, t]); } finally { clearTimeout(timer); }
}

async function updateEvent(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("capture_events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("capture: failed to update capture_events", id, error.message);
}

export async function capture(admin: SupabaseClient, ctx: CaptureContext, input: CaptureInput, deps: Deps = {}): Promise<CaptureOutcome> {
  const now = deps.now ?? Date.now;
  // receive: owner + provenance are not optional.
  if (!ctx.userId || !UUID.test(ctx.userId)) return failure(null, "receive", "no_owner", "capture has no owner", false, 401);
  if (!CAPTURE_CHANNELS.includes(ctx.channel)) return failure(null, "receive", "no_provenance", "capture has no channel", false, 400);

  const v = validateCapture(input, now());
  if (!v.ok) {
    const { data } = await admin.from("capture_events").insert({
      user_id: ctx.userId, channel: ctx.channel, client_label: ctx.clientLabel ?? null, api_key_id: ctx.apiKeyId ?? null,
      status: "failed", stage: "normalize", error: v.error, error_code: "invalid", retryable: false,
    }).select("id").single();
    return failure(data?.id ?? null, "normalize", "invalid", v.error, false, 400);
  }
  const value = v.value;

  let eventId: string | null = null;
  let attempts = 1;
  if (value.idempotency_key) {
    const existing = await findByKey(admin, ctx.userId, value.idempotency_key);
    if (existing) {
      const r = await resolveExisting(admin, ctx, existing, value, deps);
      if (r) return r;
      eventId = existing.id;
      attempts = Math.min(100, existing.attempts + 1);
    }
  }
  if (!eventId) {
    const { data, error } = await admin.from("capture_events").insert({
      user_id: ctx.userId, idempotency_key: value.idempotency_key, channel: ctx.channel,
      client_label: ctx.clientLabel ?? null, api_key_id: ctx.apiKeyId ?? null,
      status: "received", stage: "normalize", payload: value,
    }).select("id").single();
    if (error && error.code === "23505" && value.idempotency_key) {
      // Two flushes of the same queue raced; the other one owns this key.
      const other = await findByKey(admin, ctx.userId, value.idempotency_key);
      if (other) return (await resolveExisting(admin, ctx, other, value, deps)) ??
        failure(other.id, "receive", "in_progress", "this capture is already being processed", true, 409, "in_progress");
    }
    // Observability must not cost the user their memory: carry on without an event row.
    if (error) console.error("capture: could not record capture event", error.message);
    eventId = data?.id ?? null;
  }
  return await runPipeline(admin, ctx, value, eventId, attempts, deps);
}

async function findByKey(admin: SupabaseClient, userId: string, key: string): Promise<ExistingEvent | null> {
  const { data } = await admin.from("capture_events").select("id, status, memory_id, attempts, updated_at")
    .eq("user_id", userId).eq("idempotency_key", key).maybeSingle();
  return (data as ExistingEvent | null) ?? null;
}

async function resolveExisting(
  admin: SupabaseClient, ctx: CaptureContext, ev: ExistingEvent, value: NormalizedCapture, deps: Deps,
): Promise<CaptureOutcome | null> {
  const decision = decideOnExisting(ev, (deps.now ?? Date.now)());
  if (decision === "deleted") {
    return failure(ev.id, "done", "deleted", "the memory this capture created was deleted; it will not be re-created", false, 410);
  }
  if (decision === "in_progress") {
    return failure(ev.id, "receive", "in_progress", "this capture is already being processed", true, 409, "in_progress");
  }
  if (decision === "retry") {
    await updateEvent(admin, ev.id, { status: "received", stage: "normalize", error: null, error_code: null, retryable: false,
      attempts: Math.min(100, ev.attempts + 1), payload: value });
    return null; // caller runs the pipeline on this event
  }
  const { data: mem } = await admin.from("memory_items").select("id, title, content, created_at").eq("id", ev.memory_id!)
    .eq("user_id", ctx.userId).maybeSingle();
  if (!mem) return failure(ev.id, "done", "deleted", "the memory this capture created was deleted; it will not be re-created", false, 410);
  let index: "indexed" | "pending" = ev.status === "stored" ? "pending" : "indexed";
  if (decision === "reindex") {
    index = await withTimeout((deps.index ?? indexMemory)(admin, ctx.userId, mem.id, mem.title, mem.content), INDEX_TIMEOUT_MS, "pending");
    if (index === "indexed") await updateEvent(admin, ev.id, { status: "indexed", stage: "done", error: null, retryable: false });
  }
  return { ok: true, status: "duplicate", id: mem.id, created_at: mem.created_at, capture_id: ev.id, index, attempts: ev.attempts };
}

async function runPipeline(
  admin: SupabaseClient, ctx: CaptureContext, value: NormalizedCapture, eventId: string | null, attempts: number, deps: Deps,
): Promise<CaptureOutcome> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const timings: Record<string, number> = {};
  const mark = (k: string) => { timings[`${k}_ms`] = Math.round(now() - t0); };
  mark("normalize");

  // classify: Thread (project), Facets, kind.
  let projectId: string | null = null;
  if (value.project) {
    const { data } = await admin.from("projects").select("id").eq("user_id", ctx.userId).eq("key", value.project).maybeSingle();
    projectId = data?.id ?? null;
  }
  const kind = classifyKind(value.content);
  mark("classify");

  // dedupe: the same words from the same owner within ten minutes is a double send, not a second memory.
  const normalized = normalizeContent(value.title, value.content);
  const { data: recent } = await admin.from("memory_items").select("id, title, content, created_at")
    .eq("user_id", ctx.userId).is("retired_at", null)
    .gte("created_at", new Date(now() - DEDUPE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false }).limit(25);
  const dup = (recent ?? []).find((m: { title: string | null; content: string }) => normalizeContent(m.title, m.content) === normalized);
  mark("dedupe");
  if (dup) {
    if (eventId) await updateEvent(admin, eventId, { status: "duplicate", stage: "done", memory_id: dup.id, payload: null, timings: { ...timings, total_ms: timings.dedupe_ms } });
    return { ok: true, status: "duplicate", id: dup.id, created_at: dup.created_at, capture_id: eventId, index: "indexed", attempts };
  }

  // store
  const row = {
    user_id: ctx.userId,
    project_id: projectId,
    source_connection_id: null,
    source_type: "manual" as const,
    content_type: "note" as const,
    external_id: null,
    title: value.title,
    content: value.content,
    entities: value.tags,
    facets: value.facets,
    metadata: {
      ...(value.source_label ? { remembered_via: value.source_label } : {}),
      kind,
      channel: ctx.channel,
      ...(eventId ? { capture_id: eventId } : {}),
    },
    origin_key: originKeyFor(value.source_label),
    api_key_id: ctx.apiKeyId ?? null,
    occurred_at: value.occurred_at,
  };
  const { data: saved, error: storeError } = await admin.from("memory_items").insert(row).select("id, created_at").single();
  mark("store");
  if (storeError || !saved) {
    const permanent = storeError?.code === "23514" || storeError?.code === "23502" || storeError?.code === "22P02";
    const msg = (storeError?.message ?? "insert returned nothing").slice(0, 900);
    if (eventId) await updateEvent(admin, eventId, { status: "failed", stage: "store", error: msg, error_code: storeError?.code ?? "unknown",
      retryable: !permanent, timings, payload: value });
    return failure(eventId, "store", "store_failed", msg, !permanent, permanent ? 400 : 503);
  }

  // link: entity links are written by the memory_items_sync_entities trigger in the same insert; observe them.
  mark("link");

  // index
  const index = await withTimeout((deps.index ?? indexMemory)(admin, ctx.userId, saved.id, value.title, value.content), INDEX_TIMEOUT_MS, "pending");
  mark("index");
  timings.total_ms = Math.round(now() - t0);
  if (eventId) {
    await updateEvent(admin, eventId, {
      status: index === "indexed" ? "indexed" : "stored",
      stage: index === "indexed" ? "done" : "index",
      memory_id: saved.id, payload: null, timings,
      error: index === "indexed" ? null : "stored; vector index pending",
      error_code: index === "indexed" ? null : "index_pending",
      retryable: index !== "indexed",
    });
  }
  return { ok: true, status: index === "indexed" ? "indexed" : "stored", id: saved.id, created_at: saved.created_at, capture_id: eventId, index, attempts };
}

/** Retry one capture by id: a failed one re-runs from its saved payload; a stored one re-runs indexing. */
export async function retryCapture(admin: SupabaseClient, userId: string, captureId: string, deps: Deps = {}): Promise<CaptureOutcome> {
  if (!UUID.test(captureId)) return failure(null, "receive", "invalid", "capture_id must be a uuid", false, 400);
  const { data: ev } = await admin.from("capture_events")
    .select("id, user_id, status, memory_id, attempts, updated_at, payload, channel, client_label, api_key_id")
    .eq("id", captureId).eq("user_id", userId).maybeSingle();
  if (!ev) return failure(null, "receive", "not_found", "no capture with that id on this account", false, 404);
  const ctx: CaptureContext = { userId, channel: ev.channel, apiKeyId: ev.api_key_id, clientLabel: ev.client_label };
  if (ev.status === "failed" && !ev.payload) {
    return failure(ev.id, "normalize", "invalid", "this capture cannot be retried (invalid input or payload expired)", false, 409);
  }
  const payload = (ev.payload ?? {}) as NormalizedCapture;
  const r = await resolveExisting(admin, ctx, ev as ExistingEvent, payload, deps);
  if (r) return r;
  return await runPipeline(admin, ctx, payload, ev.id, Math.min(100, ev.attempts + 1), deps);
}

/** What a person (or an assistant on their behalf) can see about their captures. */
export async function captureStatus(admin: SupabaseClient, userId: string, limit = 10) {
  const [{ data: health }, { data: open }] = await Promise.all([
    admin.rpc("capture_health", { p_hours: 24, p_user_id: userId }),
    admin.from("capture_events")
      .select("id, status, stage, error, error_code, retryable, attempts, channel, client_label, created_at, updated_at, memory_id")
      .eq("user_id", userId).or("status.eq.failed,status.eq.stored,status.eq.received")
      .order("updated_at", { ascending: false }).limit(Math.max(1, Math.min(50, limit))),
  ]);
  return { health: health ?? null, needs_attention: open ?? [] };
}

/** One line an assistant can say back to the person. */
export function describeOutcome(o: CaptureOutcome): string {
  if (o.ok) {
    if (o.status === "duplicate") return `Already saved (id: ${o.id}); not stored twice.`;
    const idx = o.index === "indexed" ? "" : " Semantic indexing is pending and will be retried; keyword recall works now.";
    return `Saved to Axon Memory (id: ${o.id}). This is now visible to every AI assistant connected to this account.${idx}`;
  }
  const retry = o.retryable
    ? o.capture_id ? ` It can be retried: call retry_capture({ capture_id: "${o.capture_id}" }) or resend with the same idempotency_key.` : " Try again."
    : "";
  return `Not saved (${o.stage}: ${o.error}).${retry}`;
}
