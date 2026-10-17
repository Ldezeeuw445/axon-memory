// POST /remember  { content, title?, tags?, project?, facets?, idempotency_key?, occurred_at? }
// GET  /remember?status          -> capture health + captures needing attention
// POST /remember { retry_capture_id }  -> retry one failed / index-pending capture
// Plain REST write path (Bearer <axon token>). Used directly by ChatGPT
// Custom GPT Actions (via openapi-actions' schema) and by anything that
// isn't a full MCP client but can make an HTTP call. Same A2-1 capture
// pipeline as mcp-server's `remember` tool: one capture_events row per
// attempt, idempotent on idempotency_key (body or Idempotency-Key header).
// Public: the plain REST write path, called by tools with a personal key.
import { handlePublicPreflight as handlePreflight, publicJsonResponse as jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { resolveBearerToken, sourceLabelFor } from "../_shared/mcp-auth.ts";
import { capture, captureStatus, type CaptureChannel, retryCapture } from "../_shared/capture.ts";

const writes = (scope: string | null | undefined) => !scope || !scope.trim() || scope.split(/\s+/).includes("memory.write");

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  const resolved = await resolveBearerToken(req);
  if (!resolved) return jsonResponse({ error: "unauthorized" }, { status: 401, origin });
  const admin = supabaseAdmin();
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.has("status")) {
    return jsonResponse(await captureStatus(admin, resolved.userId, Number(url.searchParams.get("limit")) || 10), { origin });
  }
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405, origin });
  if (!writes(resolved.scope)) return jsonResponse({ error: "read-only token (no memory.write scope)" }, { status: 403, origin });

  const body = await req.json().catch(() => ({}));

  try {
    if (typeof body?.retry_capture_id === "string") {
      const r = await retryCapture(admin, resolved.userId, body.retry_capture_id);
      return r.ok
        ? jsonResponse({ ok: true, id: r.id, created_at: r.created_at, status: r.status, index: r.index, capture_id: r.capture_id }, { origin })
        : jsonResponse({ ok: false, error: r.error, code: r.code, stage: r.stage, retryable: r.retryable, capture_id: r.capture_id }, { status: r.http, origin });
    }

    // "offline" when a client says it is flushing a queue; otherwise plain REST.
    const channel: CaptureChannel = body?.channel === "offline" ? "offline" : body?.channel === "app" ? "app" : "rest";
    const r = await capture(admin, {
      userId: resolved.userId,
      channel,
      apiKeyId: resolved.apiKeyId ?? null,
      clientLabel: sourceLabelFor(body, resolved),
    }, {
      content: body?.content,
      title: body?.title,
      tags: body?.tags,
      facets: body?.facets,
      // Optional, and by key: a caller says "trading-os", not a uuid.
      project: body?.project,
      source_label: sourceLabelFor(body, resolved),
      idempotency_key: body?.idempotency_key ?? req.headers.get("idempotency-key") ?? undefined,
      occurred_at: body?.occurred_at,
    });
    if (r.ok) {
      return jsonResponse({ ok: true, id: r.id, created_at: r.created_at, status: r.status, index: r.index, capture_id: r.capture_id }, { origin });
    }
    return jsonResponse(
      { ok: false, error: r.error, code: r.code, stage: r.stage, retryable: r.retryable, capture_id: r.capture_id },
      { status: r.http, origin },
    );
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "server_error" }, { status: 500, origin });
  }
});
