// §35 recall telemetry (A12-3). One row per recall in public.recall_events:
// surface, latency, outcome, result count. Nothing personal (no user, no
// question, no memory ids). Never allowed to slow down or break a recall:
// the insert is bounded and every failure is swallowed.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type RecallSurface = "api" | "mcp" | "context_pack";
export interface RecallSample {
  surface: RecallSurface;
  ms: number;
  ok: boolean;
  results?: number | null;
  semantic?: boolean | null;
  embed_ms?: number | null;
  error_code?: string | null;
}

export function recallRow(s: RecallSample) {
  const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null);
  return {
    surface: s.surface,
    ms: int(s.ms) ?? 0,
    ok: !!s.ok,
    results: int(s.results),
    semantic: typeof s.semantic === "boolean" ? s.semantic : null,
    embed_ms: int(s.embed_ms),
    error_code: s.error_code ? String(s.error_code).slice(0, 40) : null,
  };
}

export async function recordRecallEvent(admin: SupabaseClient, s: RecallSample, timeoutMs = 400): Promise<void> {
  try {
    await Promise.race([
      admin.from("recall_events").insert(recallRow(s)).then(() => undefined, () => undefined),
      new Promise<void>((r) => setTimeout(r, timeoutMs)),
    ]);
  } catch { /* telemetry never breaks recall */ }
}
