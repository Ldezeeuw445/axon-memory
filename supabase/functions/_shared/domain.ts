// The canonical AXON Memory domain contracts (spec §3–§9, §15; task A1-1).
//
// One vocabulary for every surface — MCP, REST, the app — mapped onto the
// tables that already exist. The database side of this contract is the
// `public.memories` / `public.threads` views and `core_summary()` from
// migration 20261017101016_memory_domain_model.sql; tests/schema/memory_model.sql
// asserts the view columns equal MEMORY_VIEW_COLUMNS below and that the SQL
// Weight/Depth functions agree with computeWeight/computeDepth here.
//
// Canon nouns: Memory, Thread, Core, Facet, Weight, Depth.
// Canon verbs: Capture, Recall, Retire, Restore, Delete (+ supersession).

export const LIFECYCLE_STATES = ["active", "superseded", "retired"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Deleted is not a state: a deleted memory no longer exists anywhere. */
export const LIFECYCLE_OPS = ["capture", "retire", "restore", "supersede", "delete"] as const;
export type LifecycleOp = (typeof LIFECYCLE_OPS)[number];

export const RELATION_KINDS = ["supersedes", "contradicts", "relates", "weaves"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export const CAPTURE_CHANNELS = ["direct", "agent", "connector", "unknown"] as const;
export type CaptureChannel = (typeof CAPTURE_CHANNELS)[number];

export const SOURCE_TYPES = [
  "gmail", "outlook", "github", "notion", "slack", "linear", "google_drive", "supabase",
  "discord", "jira", "obsidian", "apple_notes", "manual",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CONTENT_TYPES = ["email", "commit", "pull_request", "issue", "page", "message", "note"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Weight: how much something matters, as mass (1 light … 5 heaviest). Never shown as a number. */
export type Weight = 1 | 2 | 3 | 4 | 5;
/** Depth: how far down time has carried it. 0 surface, 1 near, 2 deep, 3 bedrock. */
export type Depth = 0 | 1 | 2 | 3;
export const DEPTH_LEVELS = ["surface", "near", "deep", "bedrock"] as const;

/** Facet: a view of the one Core (e.g. "development", "trading", "axe-companion"). */
export type Facet = string;
export const FACET_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** "Where did this come from?" (spec §6). Always attached; never inferred away. */
export interface Provenance {
  sourceType: SourceType;
  /** The id the source itself uses (message id, commit sha, …). */
  sourceId: string | null;
  /** Which application wrote or delivered it (origin_key: claude, cursor, github, manual…). */
  sourceApplication: string | null;
  channel: CaptureChannel;
  sourceConnectionId: string | null;
  apiKeyId: string | null;
  /** When it happened at the source. */
  sourceAt: string | null;
  /** Null = stated directly; 0..1 = an inference, which must never pass as a statement. */
  confidence: number | null;
}

export interface Memory {
  id: string;
  ownerId: string;
  title: string | null;
  content: string;
  normalizedContent: string;
  contentType: ContentType | null;
  provenance: Provenance;
  createdAt: string;
  updatedAt: string;
  /** Thread membership (today: the project the memory belongs to; null = applies everywhere). */
  threadId: string | null;
  facets: Facet[];
  entities: string[];
  lifecycle: {
    state: LifecycleState;
    retiredAt: string | null;
    retiredReason: string | null;
    supersededBy: string | null;
  };
  strength: {
    weight: Weight;
    anchored: boolean;
    depth: Depth;
    recallClients: number;
    recallCount: number;
    linkCount: number;
  };
  hasEmbedding: boolean;
}

export interface Thread {
  id: string;
  ownerId: string;
  key: string;
  name: string;
  /** Where things stand — one line, overwritten (set_thread). */
  state: string | null;
  stateUpdatedBy: string | null;
  stateUpdatedAt: string | null;
  activeMemories: number;
}

export interface Core {
  ownerId: string;
  memories: number;
  active: number;
  retired: number;
  superseded: number;
  threads: number;
  facets: Facet[];
}

export interface MemoryRelation {
  id: string;
  ownerId: string;
  from: string;
  to: string;
  kind: RelationKind;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface LifecycleEvent {
  id: string;
  ownerId: string;
  memoryId: string;
  op: LifecycleOp;
  actor: string | null;
  /** Counts and ids only — never memory content. */
  detail: Record<string, unknown>;
  createdAt: string;
}

/** Columns of public.memories, in order. The schema test asserts this list. */
export const MEMORY_VIEW_COLUMNS = [
  "id", "owner_id", "title", "content", "normalized_content", "content_type",
  "source_type", "source_id", "source_application", "source_connection_id", "api_key_id",
  "capture_channel", "source_at", "created_at", "updated_at",
  "thread_id", "facets", "entities", "confidence",
  "lifecycle_state", "retired_at", "retired_reason", "superseded_by",
  "anchored_weight", "recall_clients", "recall_count", "link_count", "weight", "depth", "has_embedding",
] as const;

export const THREAD_VIEW_COLUMNS = [
  "id", "owner_id", "key", "name", "colour", "created_at",
  "state", "state_updated_by", "state_updated_at", "active_memories",
] as const;

// ── Pure rules (mirrored 1:1 by public.memory_weight / public.memory_depth) ──

export function computeWeight(s: {
  anchoredWeight?: number | null; recallClients?: number | null; linkCount?: number | null; sourceType?: string | null;
}): Weight {
  if (s.anchoredWeight != null) return clampWeight(s.anchoredWeight);
  const w = 1 + Math.min(s.recallClients ?? 0, 2) + ((s.linkCount ?? 0) >= 3 ? 1 : 0) + (s.sourceType === "manual" ? 1 : 0);
  return clampWeight(w);
}

export function computeDepth(occurredAt: string | Date | null, retiredAt: string | Date | null, now: Date = new Date()): Depth {
  if (retiredAt) return 3;
  if (!occurredAt) return 0;
  const days = (now.getTime() - new Date(occurredAt).getTime()) / 86_400_000;
  if (days < 7) return 0;
  if (days < 30) return 1;
  if (days < 365) return 2;
  return 3;
}

export function lifecycleStateOf(retiredAt: string | null, retiredReason: string | null): LifecycleState {
  if (!retiredAt) return "active";
  return retiredReason === "superseded" ? "superseded" : "retired";
}

export function normalizeContent(title: string | null, content: string): string {
  return `${title ? title + " " : ""}${content}`.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isFacet(v: unknown): v is Facet {
  return typeof v === "string" && FACET_PATTERN.test(v);
}

export function normalizeFacets(input: unknown): Facet[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    if (isFacet(slug)) out.add(slug);
  }
  return [...out];
}

function clampWeight(n: number): Weight {
  return Math.max(1, Math.min(5, Math.round(n))) as Weight;
}

// ── Row mapping + validation ──────────────────────────────────────────────────

export class ContractError extends Error {}

type Row = Record<string, unknown>;
const str = (r: Row, k: string): string => {
  const v = r[k];
  if (typeof v !== "string" || !v) throw new ContractError(`memories.${k} must be a non-empty string`);
  return v;
};
const strOrNull = (r: Row, k: string): string | null => {
  const v = r[k];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new ContractError(`memories.${k} must be a string or null`);
  return v;
};
const num = (r: Row, k: string): number => {
  const v = typeof r[k] === "string" ? Number(r[k]) : r[k];
  if (typeof v !== "number" || Number.isNaN(v)) throw new ContractError(`memories.${k} must be a number`);
  return v;
};
function oneOf<T extends readonly string[]>(list: T, v: unknown, k: string): T[number] {
  if (typeof v !== "string" || !(list as readonly string[]).includes(v)) throw new ContractError(`memories.${k} has invalid value ${JSON.stringify(v)}`);
  return v as T[number];
}

/** Map a row of public.memories to the canonical Memory, validating as it goes. */
export function memoryFromRow(r: Row): Memory {
  const content = str(r, "content");
  const confidence = r.confidence == null ? null : num(r, "confidence");
  if (confidence !== null && (confidence < 0 || confidence > 1)) throw new ContractError("memories.confidence out of range");
  const facets = Array.isArray(r.facets) ? (r.facets as unknown[]) : [];
  if (!facets.every(isFacet)) throw new ContractError("memories.facets contains an invalid facet");
  const state = oneOf(LIFECYCLE_STATES, r.lifecycle_state, "lifecycle_state");
  const retiredAt = strOrNull(r, "retired_at");
  const retiredReason = strOrNull(r, "retired_reason");
  if (state !== lifecycleStateOf(retiredAt, retiredReason)) throw new ContractError("memories.lifecycle_state disagrees with retired_at/retired_reason");
  const weight = num(r, "weight");
  const depth = num(r, "depth");
  if (weight < 1 || weight > 5) throw new ContractError("memories.weight out of range");
  if (depth < 0 || depth > 3) throw new ContractError("memories.depth out of range");
  const entities = Array.isArray(r.entities) ? (r.entities as unknown[]).filter((e): e is string => typeof e === "string") : [];
  return {
    id: str(r, "id"),
    ownerId: str(r, "owner_id"),
    title: strOrNull(r, "title"),
    content,
    normalizedContent: typeof r.normalized_content === "string" ? r.normalized_content : normalizeContent(strOrNull(r, "title"), content),
    contentType: r.content_type == null ? null : oneOf(CONTENT_TYPES, r.content_type, "content_type"),
    provenance: {
      sourceType: oneOf(SOURCE_TYPES, r.source_type, "source_type"),
      sourceId: strOrNull(r, "source_id"),
      sourceApplication: strOrNull(r, "source_application"),
      channel: oneOf(CAPTURE_CHANNELS, r.capture_channel, "capture_channel"),
      sourceConnectionId: strOrNull(r, "source_connection_id"),
      apiKeyId: strOrNull(r, "api_key_id"),
      sourceAt: strOrNull(r, "source_at"),
      confidence,
    },
    createdAt: str(r, "created_at"),
    updatedAt: str(r, "updated_at"),
    threadId: strOrNull(r, "thread_id"),
    facets: facets as Facet[],
    entities,
    lifecycle: { state, retiredAt, retiredReason, supersededBy: strOrNull(r, "superseded_by") },
    strength: {
      weight: weight as Weight,
      anchored: r.anchored_weight != null,
      depth: depth as Depth,
      recallClients: num(r, "recall_clients"),
      recallCount: num(r, "recall_count"),
      linkCount: num(r, "link_count"),
    },
    hasEmbedding: r.has_embedding === true,
  };
}
