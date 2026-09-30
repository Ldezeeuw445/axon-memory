// POST /remember  { content, title?, tags? }
// Plain REST write path (Bearer <axon token>). Used directly by ChatGPT
// Custom GPT Actions (via openapi-actions' schema) and by anything that
// isn't a full MCP client but can make an HTTP call. Writes to the exact
// same `memory_items` table mcp-server's `remember` tool and the rest of
// the app use — same shared-memory guarantee, different transport.
// Public: the plain REST write path, called by tools with a personal key.
import { handlePublicPreflight as handlePreflight, publicJsonResponse as jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { resolveBearerToken, sourceLabelFor } from "../_shared/mcp-auth.ts";
import { rememberMemory } from "../_shared/memory-core.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405, origin });

  const resolved = await resolveBearerToken(req);
  if (!resolved) return jsonResponse({ error: "unauthorized" }, { status: 401, origin });

  const body = await req.json().catch(() => ({}));
  if (!body?.content || typeof body.content !== "string") {
    return jsonResponse({ error: "content (string) is required" }, { status: 400, origin });
  }

  try {
    const admin = supabaseAdmin();
    const saved = await rememberMemory(admin, resolved.userId, {
      content: body.content,
      title: typeof body.title === "string" ? body.title : null,
      tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [],
      source_label: sourceLabelFor(body, resolved),
      // Optional, and by key: a caller says "trading-os", not a uuid it would
      // have had to look up. Omitted files the memory as general.
      project: typeof body.project === "string" ? body.project : null,
      api_key_id: resolved.apiKeyId ?? null,
    });
    return jsonResponse({ ok: true, id: saved.id, created_at: saved.created_at }, { origin });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "server_error" }, { status: 500, origin });
  }
});
