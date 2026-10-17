// Connector runtime contract (A8-1).
//
// One honest description of every source connection, shared by the app
// (connectors function), the public API (GET /v1/connectors) and revoke
// (disconnect-source). The rule from spec §20: never imply a connector is
// synchronised when it is not. So "health" is derived from what actually
// happened — last success, last attempt, failures, whether a sync even
// exists for the provider — and the raw status column is only one input.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Admin = SupabaseClient;

export type Health =
  | "healthy" // last run succeeded recently
  | "pending" // linked, has never completed a sync yet
  | "syncing" // a run is in progress
  | "stuck" // marked syncing for far longer than any run takes
  | "stale" // status says connected but nothing has succeeded for a long time
  | "failing" // last run failed
  | "unsupported" // linked, but AXON has no sync for this provider
  | "disconnected"; // revoked by the user; tokens deleted

/** The scheduler runs every 30 min; three missed runs is no longer "connected". */
export const STALE_AFTER_MS = 3 * 3600e3;
/** A run is bounded by the function wall clock (minutes). Far past that is not "syncing". */
export const STUCK_AFTER_MS = 20 * 60e3;

export type RevokeMethod = "provider_api" | "manual";

export interface CatalogEntry {
  name: string;
  /** A sync implementation exists in _shared/source-sync.ts. */
  supported: boolean;
  /** Plain-language: what AXON reads, and only that. */
  reads: string;
  /** What the provider's grant technically allows, when it is broader than what AXON uses. */
  grant_note?: string;
  /** Scopes AXON asks the provider for. */
  requested_scopes: string[];
  /** Where a person can see and revoke the grant on the provider's side. */
  manage_url: string | null;
  revoke_method: RevokeMethod;
}

export const CATALOG: Record<string, CatalogEntry> = {
  gmail: {
    name: "Gmail", supported: true,
    reads: "The most recent inbox messages (sender, subject, text). Read-only; AXON never sends, deletes or labels mail.",
    requested_scopes: ["gmail.readonly", "openid", "email"],
    manage_url: "https://myaccount.google.com/permissions", revoke_method: "provider_api",
  },
  google_drive: {
    name: "Google Drive", supported: true,
    reads: "Recently modified documents' names and text. Read-only.",
    requested_scopes: ["drive.readonly", "openid", "email"],
    manage_url: "https://myaccount.google.com/permissions", revoke_method: "provider_api",
  },
  outlook: {
    name: "Outlook", supported: true,
    reads: "The most recent inbox messages (sender, subject, preview). Read-only.",
    requested_scopes: ["offline_access", "openid", "email", "Mail.Read", "User.Read"],
    manage_url: "https://account.live.com/consent/Manage", revoke_method: "manual",
  },
  github: {
    name: "GitHub", supported: true,
    reads: "Commits, pull requests, issues and README/docs of the repositories you map to a thread.",
    grant_note: "GitHub's 'repo' scope technically includes write access; AXON only ever reads.",
    requested_scopes: ["repo", "read:user"],
    manage_url: "https://github.com/settings/applications", revoke_method: "manual",
  },
  notion: {
    name: "Notion", supported: true,
    reads: "Pages you shared with AXON during the Notion consent screen (titles and text). Read-only.",
    grant_note: "Notion grants access per page; only pages you picked are visible.",
    requested_scopes: [],
    manage_url: "https://www.notion.so/my-integrations", revoke_method: "manual",
  },
  slack: {
    name: "Slack", supported: true,
    reads: "Recent messages in a few public and private channels the AXON app was added to. Read-only.",
    requested_scopes: ["channels:history", "channels:read", "groups:history", "groups:read", "users:read", "team:read"],
    manage_url: null, revoke_method: "provider_api",
  },
  linear: {
    name: "Linear", supported: true,
    reads: "Recent issues and their descriptions. Read-only.",
    requested_scopes: ["read"],
    manage_url: "https://linear.app/settings/account/security", revoke_method: "provider_api",
  },
  supabase: {
    name: "Supabase", supported: true,
    reads: "Your project list and the table/column names of each project's public schema. No row data.",
    grant_note: "Supabase grants the permissions configured on the AXON OAuth app, which can be broader; AXON only runs the read-only schema query.",
    requested_scopes: [],
    manage_url: "https://supabase.com/dashboard/account/apps", revoke_method: "manual",
  },
  discord: { name: "Discord", supported: false, reads: "Nothing yet: no Discord sync exists.", requested_scopes: [], manage_url: null, revoke_method: "manual" },
  jira: { name: "Jira", supported: false, reads: "Nothing yet: no Jira sync exists.", requested_scopes: [], manage_url: null, revoke_method: "manual" },
  obsidian: { name: "Obsidian", supported: false, reads: "Nothing yet: Obsidian is local-only and needs an on-device agent.", requested_scopes: [], manage_url: null, revoke_method: "manual" },
  apple_notes: { name: "Apple Notes", supported: false, reads: "Nothing yet: Apple Notes is local-only and needs an on-device agent.", requested_scopes: [], manage_url: null, revoke_method: "manual" },
};

export function catalogEntry(provider: string): CatalogEntry {
  return CATALOG[provider] ?? {
    name: provider, supported: false, reads: "Nothing: unknown provider.", requested_scopes: [], manage_url: null, revoke_method: "manual",
  };
}

export function isSupportedProvider(provider: string): boolean {
  return catalogEntry(provider).supported;
}

export interface ConnectionRow {
  id: string;
  provider: string;
  status: string;
  external_account_label?: string | null;
  scopes?: string[] | null;
  last_synced_at?: string | null;
  last_attempt_at?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
  consecutive_failures?: number | null;
  last_fetched_count?: number | null;
  last_stored_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Never returned; only used to say whether a token is still held. */
  has_token?: boolean;
}

export const CONNECTION_COLUMNS =
  "id, provider, status, external_account_label, scopes, last_synced_at, last_attempt_at, last_error, last_error_at, " +
  "consecutive_failures, last_fetched_count, last_stored_count, created_at, updated_at";

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

export function deriveHealth(row: ConnectionRow, now = Date.now()): Health {
  if (row.status === "disconnected") return "disconnected";
  if (!isSupportedProvider(row.provider)) return "unsupported";
  if (row.status === "error") return "failing";
  if (row.status === "syncing") {
    const started = ms(row.last_attempt_at) || ms(row.updated_at);
    return Number.isFinite(started) && now - started > STUCK_AFTER_MS ? "stuck" : "syncing";
  }
  // status === "connected" (or anything unrecognised, treated as connected)
  const ok = ms(row.last_synced_at);
  if (!Number.isFinite(ok)) return "pending";
  if (now - ok > STALE_AFTER_MS) return "stale";
  return "healthy";
}

export type ErrorKind = "auth" | "permission" | "setup" | "rate_limit" | "provider" | "storage" | "unsupported" | "unknown";

/** Tokens and long opaque strings never leave the server, even to the owner. */
export function redactError(message: string | null | undefined): string | null {
  if (!message) return null;
  return String(message)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(ya29\.[\w.-]+|gh[pousr]_\w+|xox[abposr]-[\w-]+|lin_(api|oauth)_\w+|sbp_\w+|secret_\w+|ntn_\w+)/g, "[redacted]")
    .replace(/[A-Za-z0-9_\-]{40,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function classifyError(message: string | null | undefined): { kind: ErrorKind; action: string } {
  const m = String(message ?? "");
  if (/^unsupported:|not supported/i.test(m)) return { kind: "unsupported", action: "Nothing to do yet; AXON cannot sync this source." };
  // A choice the person has not made yet — not a broken grant, so never "reconnect".
  if (/no repositories chosen/i.test(m)) return { kind: "setup", action: "Choose which repositories AXON reads." };
  if (/permission not granted|insufficient|scope|\b403\b|forbidden|missing_scope|not_in_channel/i.test(m)) {
    return { kind: "permission", action: "Reconnect and grant every requested permission." };
  }
  if (/\b401\b|invalid_grant|invalid_auth|token_expired|not_authed|unauthori[sz]ed|revoked|expired|refresh/i.test(m)) {
    return { kind: "auth", action: "Reconnect: the provider no longer accepts AXON's access." };
  }
  if (/\b429\b|rate.?limit|ratelimited/i.test(m)) return { kind: "rate_limit", action: "Wait; AXON retries automatically." };
  if (/upsert failed|memory_items|database/i.test(m)) return { kind: "storage", action: "AXON-side problem; it retries automatically. Contact support if it persists." };
  if (/\b5\d\d\b|timeout|timed out|unavailable|fetch failed|network/i.test(m)) return { kind: "provider", action: "Provider problem; AXON retries automatically." };
  return { kind: "unknown", action: "AXON retries automatically. Reconnect if it keeps failing." };
}

const SUMMARY: Record<Health, (r: ConnectionRow, e: CatalogEntry) => string> = {
  healthy: (_r, e) => `${e.name} is syncing normally.`,
  pending: (_r, e) => `${e.name} is linked but has not completed a sync yet.`,
  syncing: (_r, e) => `${e.name} sync in progress.`,
  stuck: (_r, e) => `${e.name} started a sync that never finished. It will be retried.`,
  stale: (_r, e) => `${e.name} has not synced successfully for over ${STALE_AFTER_MS / 3600e3} hours.`,
  failing: (r, e) => `${e.name} is not syncing: the last ${Math.max(1, r.consecutive_failures ?? 1) > 1 ? `${r.consecutive_failures} attempts` : "attempt"} failed.`,
  unsupported: (_r, e) => `${e.name} is linked, but AXON has no sync for it yet. Nothing is imported.`,
  disconnected: (_r, e) => `${e.name} is disconnected. Tokens are deleted; imported memories are kept.`,
};

export function connectorContract(row: ConnectionRow, importedItems: number | null, now = Date.now()) {
  const entry = catalogEntry(row.provider);
  const health = deriveHealth(row, now);
  const errMsg = redactError(row.last_error);
  const showError = !!errMsg && (health === "failing" || health === "stale" || health === "stuck" || health === "pending");
  const cls = classifyError(row.last_error);
  return {
    id: row.id,
    provider: row.provider,
    name: entry.name,
    account: row.external_account_label ?? null,
    status: row.status,
    health,
    /** True only when the last run succeeded recently. Never true for a failed, stale, stuck or unsupported connector. */
    synchronized: health === "healthy",
    supported: entry.supported,
    summary: SUMMARY[health](row, entry),
    connected_at: row.created_at ?? null,
    last_success_at: row.last_synced_at ?? null,
    last_attempt_at: row.last_attempt_at ?? null,
    consecutive_failures: row.consecutive_failures ?? 0,
    error: showError
      ? { kind: cls.kind, message: errMsg, at: row.last_error_at ?? null, action: cls.action }
      : null,
    imported: {
      items: importedItems,
      last_run: row.last_fetched_count == null && row.last_stored_count == null
        ? null
        : { fetched: row.last_fetched_count ?? null, stored: row.last_stored_count ?? null },
    },
    scope: {
      access: "read-only" as const,
      requested: entry.requested_scopes,
      granted: row.scopes && row.scopes.length ? row.scopes : null,
      explanation: entry.reads,
      ...(entry.grant_note ? { note: entry.grant_note } : {}),
    },
    cursor: {
      kind: row.provider === "github" ? "last_success_at (forward) + per-repo backfill" : "latest page each run; duplicates skipped by external id",
      value: row.last_synced_at ?? null,
    },
    provenance: {
      source_type: row.provider,
      connection_id: row.id,
      note: "Every imported memory carries source.channel='connector', source.provider, source.account and source.connection_id, and is deduplicated by the provider's own item id.",
    },
    revoke: {
      available: row.status !== "disconnected",
      method: entry.revoke_method,
      manage_url: entry.manage_url,
      keeps_imported_memories: true,
    },
  };
}

export type ConnectorContract = ReturnType<typeof connectorContract>;

async function importedCount(admin: Admin, userId: string, connectionId: string): Promise<number | null> {
  const { count, error } = await admin
    .from("memory_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source_connection_id", connectionId);
  return error ? null : count ?? 0;
}

export async function listConnectors(admin: Admin, userId: string, id?: string): Promise<ConnectorContract[]> {
  let q = admin.from("source_connections").select(CONNECTION_COLUMNS).eq("user_id", userId);
  if (id) q = q.eq("id", id);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(`could not read connections: ${error.message}`);
  const rows = (data ?? []) as unknown as ConnectionRow[];
  const counts = await Promise.all(rows.map((r) => importedCount(admin, userId, r.id)));
  return rows.map((r, i) => connectorContract(r, counts[i]));
}

/**
 * Best-effort revocation of the grant on the provider's side. Only for
 * providers with a token-revocation endpoint that needs nothing but the token.
 * Returns what happened, so the caller can say so instead of implying it.
 */
export async function revokeAtProvider(
  provider: string,
  accessToken: string | null,
  refreshToken: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ attempted: boolean; revoked: boolean; detail?: string }> {
  const entry = catalogEntry(provider);
  if (entry.revoke_method !== "provider_api") return { attempted: false, revoked: false, detail: "manual" };
  const token = provider === "gmail" || provider === "google_drive" ? (refreshToken || accessToken) : accessToken;
  if (!token) return { attempted: false, revoked: false, detail: "no token stored" };
  try {
    let res: Response;
    if (provider === "gmail" || provider === "google_drive") {
      res = await fetchImpl("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      });
      return { attempted: true, revoked: res.ok, ...(res.ok ? {} : { detail: `google ${res.status}` }) };
    }
    if (provider === "slack") {
      res = await fetchImpl("https://slack.com/api/auth.revoke", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => ({}));
      return { attempted: true, revoked: !!j?.ok, ...(j?.ok ? {} : { detail: `slack ${j?.error ?? res.status}` }) };
    }
    if (provider === "linear") {
      res = await fetchImpl("https://api.linear.app/oauth/revoke", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      return { attempted: true, revoked: res.ok, ...(res.ok ? {} : { detail: `linear ${res.status}` }) };
    }
    return { attempted: false, revoked: false, detail: "manual" };
  } catch (err) {
    return { attempted: true, revoked: false, detail: String(err instanceof Error ? err.message : err).slice(0, 120) };
  }
}
