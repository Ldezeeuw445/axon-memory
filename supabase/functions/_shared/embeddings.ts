// Real semantic search, backed by Google's Gemini embedding model
// (gemini-embedding-001). One file, two call sites: rememberMemory (manual
// writes, MCP `remember`) and syncOneConnection (Gmail/GitHub/Notion/Slack)
// both call embedAndStore after writing a memory_items row — so anything
// that ever enters memory, from any path, becomes searchable by meaning,
// not just keyword.
//
// The memory_embeddings.embedding column is vector(1536); gemini-embedding-001
// supports an explicit output_dimensionality, so we ask for exactly 1536 —
// no schema change needed. MRL-truncated output isn't guaranteed unit-length,
// so we L2-normalize before storing (standard practice for this model).
//
// Cost ceiling: gemini-embedding-001 is $0.15 / 1M input tokens on the paid
// tier (https://ai.google.dev/gemini-api/docs/pricing, checked Aug 2026).
// A bug, a runaway sync loop, or one abusive account calling this in a tight
// loop could otherwise run up real spend with nobody watching. Before every
// call we check three counters (today/global, today/this-user, this-month/
// global) against configurable caps; if any is tripped we skip the API call
// entirely, log one alert row (not one per skipped call), and fall back —
// callers already treat a null vector as "no embedding this time, keep
// going" (see rememberMemory / buildContextPack), so tripping the ceiling
// degrades to keyword search rather than breaking anything.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const EMBED_DIM = 1536;
const MODEL = "gemini-embedding-001";
const CHARS_PER_TOKEN = 4; // same approximation used in memory-core.ts
// $0.15 / 1M tokens, ~4 chars/token -> $0.15 / 4M chars -> $0.0000375 / 1K chars.
const PRICE_PER_1K_CHARS_USD = (0.15 * 1000) / (1_000_000 * CHARS_PER_TOKEN);

function envNumber(key: string, fallback: number): number {
  const raw = Deno.env.get(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Sane defaults if the operator hasn't set secrets yet. These are
// deliberately conservative for a $5-$10/mo consumer product — tune via
// EMBEDDING_DAILY_COST_CAP_USD / EMBEDDING_DAILY_USER_COST_CAP_USD /
// EMBEDDING_MONTHLY_COST_CAP_USD Supabase secrets.
const DAILY_GLOBAL_CAP = () => envNumber("EMBEDDING_DAILY_COST_CAP_USD", 5);
const DAILY_USER_CAP = () => envNumber("EMBEDDING_DAILY_USER_COST_CAP_USD", 0.5);
const MONTHLY_GLOBAL_CAP = () => envNumber("EMBEDDING_MONTHLY_COST_CAP_USD", 60);

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

function normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (!norm || !Number.isFinite(norm)) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Checks the three cost counters before spending any money. Returns null if
 * the call should proceed, or a reason string if it should be skipped. Also
 * fires (at most one) alert row per scope per period via trip_embedding_alert.
 */
async function checkCostCeiling(admin: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null; // no per-user counter to check against (shouldn't happen in practice)

  const { data, error } = await admin.rpc("get_embedding_usage_today", { p_user_id: userId });
  if (error) {
    console.error("embeddings: cost ceiling check failed, proceeding without a cap this call", error.message);
    return null; // fail open on our own plumbing breaking, not on the actual spend risk
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const dailyGlobalCap = DAILY_GLOBAL_CAP();
  const dailyUserCap = DAILY_USER_CAP();
  const monthlyGlobalCap = MONTHLY_GLOBAL_CAP();

  if (Number(row.global_cost_usd) >= dailyGlobalCap) {
    if (!row.global_alerted) {
      await admin.rpc("trip_embedding_alert", {
        p_scope: "global",
        p_user_id: null,
        p_message: `Daily global embedding cost cap hit: $${row.global_cost_usd} >= $${dailyGlobalCap}. New embedding calls are paused for the rest of the day; search falls back to keyword.`,
        p_metadata: { cap: dailyGlobalCap, spent: row.global_cost_usd },
      });
    }
    return "daily global cap";
  }
  if (Number(row.month_cost_usd) >= monthlyGlobalCap) {
    if (!row.month_alerted) {
      await admin.rpc("trip_embedding_alert", {
        p_scope: "month",
        p_user_id: null,
        p_message: `Monthly global embedding cost cap hit: $${row.month_cost_usd} >= $${monthlyGlobalCap}. New embedding calls are paused for the rest of the month; search falls back to keyword.`,
        p_metadata: { cap: monthlyGlobalCap, spent: row.month_cost_usd },
      });
    }
    return "monthly global cap";
  }
  if (Number(row.user_cost_usd) >= dailyUserCap) {
    if (!row.user_alerted) {
      await admin.rpc("trip_embedding_alert", {
        p_scope: "user",
        p_user_id: userId,
        p_message: `Per-user daily embedding cost cap hit for user ${userId}: $${row.user_cost_usd} >= $${dailyUserCap}. Likely a single account driving unusually high write/sync volume.`,
        p_metadata: { cap: dailyUserCap, spent: row.user_cost_usd, user_id: userId },
      });
    }
    return "per-user daily cap";
  }
  return null;
}

async function embed(admin: SupabaseClient, userId: string | null, text: string, taskType: TaskType): Promise<number[] | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("embeddings: GEMINI_API_KEY not set, skipping embedding");
    return null;
  }
  const trimmed = text.trim().slice(0, 8000); // generous cap, avoids oversized payloads
  if (!trimmed) return null;

  const skipReason = await checkCostCeiling(admin, userId);
  if (skipReason) {
    console.error(`embeddings: skipping call, ${skipReason} reached`);
    return null;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: trimmed }] },
          task_type: taskType,
          output_dimensionality: EMBED_DIM,
        }),
      },
    );
    if (!res.ok) {
      console.error("embeddings: gemini embedContent failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const values = data?.embedding?.values as number[] | undefined;
    if (!Array.isArray(values) || values.length !== EMBED_DIM) {
      console.error("embeddings: unexpected embedding shape", values?.length);
      return null;
    }

    if (userId) {
      const cost = (trimmed.length / 1000) * PRICE_PER_1K_CHARS_USD;
      const { error: rpcError } = await admin.rpc("record_embedding_usage", {
        p_user_id: userId,
        p_chars: trimmed.length,
        p_cost_usd: cost,
      });
      if (rpcError) console.error("embeddings: failed to record usage", rpcError.message);
    }

    return normalize(values);
  } catch (err) {
    console.error("embeddings: gemini embedContent threw", err);
    return null;
  }
}

/**
 * Generates an embedding for a memory item and upserts it into
 * memory_embeddings. Best-effort: any failure (missing key, provider
 * hiccup, rate limit, cost ceiling reached) is logged and swallowed — the
 * memory item itself was already saved successfully, and losing semantic
 * search for one item is far better than losing the write entirely.
 */
export async function embedAndStore(
  admin: SupabaseClient,
  userId: string,
  memoryItemId: string,
  title: string | null,
  content: string,
): Promise<void> {
  const text = [title, content].filter(Boolean).join("\n\n");
  const vector = await embed(admin, userId, text, "RETRIEVAL_DOCUMENT");
  if (!vector) return;

  const { error } = await admin
    .from("memory_embeddings")
    .upsert({ memory_item_id: memoryItemId, embedding: vector }, { onConflict: "memory_item_id" });
  if (error) console.error("embeddings: failed to store embedding", error.message);
}

/**
 * Embeds a search query (RETRIEVAL_QUERY task type — asymmetric from
 * RETRIEVAL_DOCUMENT, which is what makes this model good at "find the doc
 * that answers this question" rather than just "find similar text").
 */
export async function embedQuery(admin: SupabaseClient, userId: string, query: string): Promise<number[] | null> {
  return embed(admin, userId, query, "RETRIEVAL_QUERY");
}
