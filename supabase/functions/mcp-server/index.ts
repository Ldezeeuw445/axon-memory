// POST /mcp-server — the actual remote MCP endpoint (Streamable HTTP,
// JSON-RPC 2.0, single-response mode). This is what Claude/Cursor/any MCP
// client calls after the OAuth dance above hands it a Bearer token.
//
// Three tools are exposed:
//   recall_context  -> read  (wraps buildContextPack, same as context-pack)
//   remember        -> write (inserts into memory_items)
//   list_sources    -> read  (lists connected data sources)
//
// Because every tool call resolves its Bearer token against the SAME
// `api_keys` table (resolveBearerToken, shared with context-pack), and every
// tool reads/writes the SAME `memory_items` table (memory-core.ts, shared
// with context-pack and remember/index.ts), three different AI assistants
// connected to the same Axon account are, structurally, reading and writing
// one single memory — not three separate integrations that happen to look
// similar. Ask Claude something, ask ChatGPT the same account's context five
// minutes later, and it sees what you just told Claude, because there is
// only one place any of it was ever stored.
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { resolveBearerToken } from "../_shared/mcp-auth.ts";
import { buildContextPack, rememberMemory, listSourcesForUser } from "../_shared/memory-core.ts";
import { APP_URL } from "../_shared/oauth.ts";

const SERVER_INFO = { name: "axon-memory", version: "1.0.0" };
const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "recall_context",
    description:
      "Retrieve the user's remembered context from Axon Memory — profile, connected sources, entities, and relevant notes/messages/documents. Call this at the start of a conversation, or whenever you need to know something the user has told another assistant, connected app, or previously told you.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What you're trying to find out. Leave blank for a general overview." },
        token_budget: { type: "number", description: "Approximate max tokens of context to return. Default 1500." },
      },
    },
  },
  {
    name: "remember",
    description:
      "Save a fact, preference, decision, or note to the user's Axon Memory so it is available to every other AI assistant and tool connected to this account.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to remember, written as a clear standalone statement." },
        title: { type: "string", description: "Optional short label." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags/entities for later recall." },
      },
      required: ["content"],
    },
  },
  {
    name: "list_sources",
    description: "List the third-party data sources (Gmail, GitHub, Notion, Slack, etc.) the user has connected to Axon Memory.",
    inputSchema: { type: "object", properties: {} },
  },
];

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method !== "POST") {
    return new Response("MCP endpoint: POST JSON-RPC only", { status: 405, headers: cors });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || body.jsonrpc !== "2.0") {
    return new Response(JSON.stringify(rpcError(null, -32600, "Invalid Request")), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { id, method, params } = body as { id: unknown; method: string; params?: Record<string, unknown> };

  // initialize / notifications need no auth (they carry no user data).
  if (method === "initialize") {
    return json(rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        "Call recall_context near the start of a conversation to load what you already know about this user, and call remember whenever they share something worth keeping for next time or for their other connected assistants.",
    }), cors);
  }
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: cors });
  }
  if (method === "ping") {
    return json(rpcResult(id, {}), cors);
  }

  // Everything else touches user memory -> auth required.
  const resolved = await resolveBearerToken(req);
  if (!resolved) {
    return unauthorized(cors);
  }

  if (method === "tools/list") {
    return json(rpcResult(id, { tools: TOOLS }), cors);
  }

  if (method === "tools/call") {
    const toolName = params?.name as string | undefined;
    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    const admin = supabaseAdmin();

    try {
      if (toolName === "recall_context") {
        const pack = await buildContextPack(admin, resolved.userId, {
          query: (args.query as string) ?? null,
          tokenBudget: (args.token_budget as number) ?? undefined,
          apiKeyId: resolved.apiKeyId,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(pack, null, 2) }] }), cors);
      }

      if (toolName === "remember") {
        const saved = await rememberMemory(admin, resolved.userId, {
          content: args.content as string,
          title: (args.title as string) ?? null,
          tags: (args.tags as string[]) ?? [],
          source_label: resolved.clientLabel ?? "MCP client",
        });
        return json(
          rpcResult(id, {
            content: [{ type: "text", text: `Saved to Axon Memory (id: ${saved.id}). This is now visible to every AI assistant connected to this account.` }],
          }),
          cors,
        );
      }

      if (toolName === "list_sources") {
        const sources = await listSourcesForUser(admin, resolved.userId);
        return json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(sources, null, 2) }] }), cors);
      }

      return json(rpcError(id, -32601, `Unknown tool: ${toolName}`), cors, 400);
    } catch (err) {
      console.error("mcp-server tools/call error", err);
      return json(rpcError(id, -32000, err instanceof Error ? err.message : "Internal error"), cors, 500);
    }
  }

  return json(rpcError(id, -32601, `Unknown method: ${method}`), cors, 400);
});

function json(payload: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "content-type": "application/json" } });
}

function unauthorized(cors: Record<string, string>) {
  const resourceOrigin = new URL(APP_URL).origin.replace("https://", "https://mcp.");
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" } }), {
    status: 401,
    headers: {
      ...cors,
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${resourceOrigin}/.well-known/oauth-protected-resource"`,
    },
  });
}
