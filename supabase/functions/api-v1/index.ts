// AXON public API v1 (A7-1). Routes: see openapi.ts and docs/API.md.
// Reached at https://mcp.axon-memory.com/v1/* (gateway) or
// <supabase>/functions/v1/api-v1/v1/*. Public door (token auth, no cookies).
import { handlePublicPreflight as handlePreflight, publicCorsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { resolveBearerToken } from "../_shared/mcp-auth.ts";
import {
  API_BUILD, API_VERSION, ApiError, apiCaptureOutcome, canWrite, capture, captureStatus, getCapture, getMemory,
  lifecycle, lifecycleError, listThreads, me, recall, requireId, retryCapture, routeOf,
} from "../_shared/api-v1.ts";
import { OPENAPI } from "./openapi.ts";

function send(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...publicCorsHeaders(), "Content-Type": "application/json", "X-Axon-Api-Version": API_VERSION, ...extra },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET" || req.method === "DELETE") return {};
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "invalid", "body must be a JSON object");
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const route = routeOf(new URL(req.url).pathname);
  const [res, id, action] = route;
  const m = req.method;

  try {
    if (res === "health" && m === "GET") return send({ status: "ok", api_version: API_VERSION, build: API_BUILD, time: new Date().toISOString() });
    if (res === "openapi.json" && m === "GET") return send(OPENAPI);

    const resolved = await resolveBearerToken(req);
    if (!resolved) {
      throw new ApiError(401, "unauthorized", "Send Authorization: Bearer <personal key or OAuth access token>. Expired OAuth tokens: use your refresh token.");
    }
    const admin = supabaseAdmin();

    const { data: gate } = await admin.rpc("take_rate_limit_token", { p_api_key_id: resolved.apiKeyId, p_window_seconds: 60, p_limit: 60 });
    const verdict = Array.isArray(gate) ? gate[0] : gate;
    if (verdict && verdict.allowed === false) {
      const retryAfter = Math.max(1, Math.ceil((Date.parse(verdict.resets_at) - Date.now()) / 1000)) || 60;
      return send(new ApiError(429, "rate_limited", `60 calls a minute per token (shared with MCP). Try again in ${retryAfter}s.`, true).body(), 429, { "Retry-After": String(retryAfter) });
    }

    const needWrite = () => {
      if (!canWrite(resolved.scope)) throw new ApiError(403, "forbidden_scope", "This token was granted read-only access (no memory.write scope).");
    };
    const actor = resolved.clientLabel ?? "api";
    const caller = { apiKeyId: resolved.apiKeyId, clientLabel: resolved.clientLabel };

    if (res === "me" && !id && m === "GET") return send(await me(admin, resolved.userId, resolved));
    if (res === "threads" && !id && m === "GET") return send(await listThreads(admin, resolved.userId));
    if (res === "recall" && !id && m === "POST") return send(await recall(admin, resolved.userId, await readJson(req), caller));

    if (res === "memories") {
      if (!id && m === "POST") {
        needWrite();
        const body = await readJson(req);
        const source = (body.source && typeof body.source === "object" ? body.source : {}) as Record<string, unknown>;
        const label = str(source.label) ?? (resolved.viaOauthClient ? resolved.clientLabel : null);
        const outcome = await capture(admin, { userId: resolved.userId, channel: "api", apiKeyId: resolved.apiKeyId, clientLabel: label }, {
          content: body.content, title: body.title, facets: body.facets, tags: body.tags,
          project: body.thread ?? body.project, source_label: label,
          idempotency_key: body.idempotency_key ?? req.headers.get("idempotency-key") ?? undefined,
          occurred_at: body.occurred_at, source_ref: source.ref,
        });
        const r = apiCaptureOutcome(outcome);
        const memory = await getMemory(admin, resolved.userId, r.body.memory_id).catch(() => null);
        return send({ ...r.body, memory }, r.body.duplicate ? 200 : 201);
      }
      const memId = requireId(id);
      try {
        if (!action && m === "GET") return send(await getMemory(admin, resolved.userId, memId));
        if (!action && m === "DELETE") {
          needWrite();
          const r = await lifecycle.deleteMemory(admin, resolved.userId, memId, { actor });
          return send({ deleted: true, id: memId, removed: r });
        }
        if (m === "POST" && action === "retire") {
          needWrite();
          const body = await readJson(req);
          const r = await lifecycle.retireMemory(admin, resolved.userId, memId, { reason: str(body.reason), actor });
          return send({ changed: r.changed !== false, memory: await getMemory(admin, resolved.userId, memId) });
        }
        if (m === "POST" && action === "restore") {
          needWrite();
          const r = await lifecycle.restoreMemory(admin, resolved.userId, memId, { actor });
          return send({ changed: r.changed !== false, memory: await getMemory(admin, resolved.userId, memId) });
        }
        if (m === "POST" && action === "supersede") {
          needWrite();
          const body = await readJson(req);
          let newId = str(body.new_id);
          const content = str(body.content);
          if (!newId === !content) throw new ApiError(400, "invalid", "pass exactly one of new_id or content");
          // The old memory must be this account's before anything new is captured,
          // so a refused supersede never leaves a stray replacement behind.
          await getMemory(admin, resolved.userId, memId);
          if (!newId) {
            const label = resolved.viaOauthClient ? resolved.clientLabel : null;
            const o = apiCaptureOutcome(await capture(admin, { userId: resolved.userId, channel: "api", apiKeyId: resolved.apiKeyId, clientLabel: label },
              { content, project: body.thread, source_label: label }));
            newId = o.body.memory_id;
          }
          const r = await lifecycle.supersedeMemory(admin, resolved.userId, memId, requireId(newId!), { reason: str(body.reason), actor });
          return send({ changed: r.changed !== false, old: await getMemory(admin, resolved.userId, memId), new: await getMemory(admin, resolved.userId, newId!) });
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        lifecycleError(err);
      }
    }

    if (res === "captures") {
      if (!id && m === "GET") return send(await captureStatus(admin, resolved.userId, 20));
      const capId = requireId(id, "capture");
      if (!action && m === "GET") return send(await getCapture(admin, resolved.userId, capId));
      if (action === "retry" && m === "POST") {
        needWrite();
        const r = apiCaptureOutcome(await retryCapture(admin, resolved.userId, capId));
        return send(r.body, 201);
      }
    }

    const known = ["me", "threads", "recall", "memories", "captures", "health", "openapi.json"].includes(res ?? "");
    throw known
      ? new ApiError(405, "method_not_allowed", `${m} is not supported on /v1/${route.join("/")}`)
      : new ApiError(404, "not_found", `No route /v1/${route.join("/")}. See /v1/openapi.json`);
  } catch (err) {
    if (err instanceof ApiError) return send(err.body(), err.status);
    console.error("api-v1 error", err);
    return send(new ApiError(500, "server_error", "unexpected error", true).body(), 500);
  }
});
