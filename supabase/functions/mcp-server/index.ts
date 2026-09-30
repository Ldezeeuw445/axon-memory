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
// Public: this is the gateway every assistant and tool talks to.
import { handlePublicPreflight as handlePreflight, publicCorsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { sourceLabelFor, resolveBearerToken } from "../_shared/mcp-auth.ts";
import { buildContextPack, rememberMemory, listSourcesForUser, resolveProjectId } from "../_shared/memory-core.ts";
import { addCatch, addPhase, addTask, listTasks, markTask, listWork, claimWork, completeWork } from "../_shared/workspace.ts";
import { mcpOrigin } from "../_shared/oauth.ts";

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
        project: {
          type: "string",
          description:
            "Which project you are working on, e.g. \"trading-os\". Narrows the recall to that project plus anything that applies across all of them. Omit if you do not know — an unscoped recall is better than a wrong one. Call list_projects to see the keys.",
        },
      },
    },
  },
  {
    name: "remember",
    description:
      "Save a fact, preference, decision, or note to the user's Axon Memory so " +
      "it is available to every other AI assistant and tool connected to this " +
      "account. Call this when the user states a preference, settles a " +
      "decision, corrects you, or explains why something is done a particular " +
      "way — save the reason rather than what changed. Not for progress " +
      "reports or summaries of the conversation.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to remember, written as a clear standalone statement." },
        title: { type: "string", description: "Optional short label." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags/entities for later recall." },
        project: {
          type: "string",
          description:
            "Which project this is about, e.g. \"trading-os\". Omit for something true across all of them — a preference, an identity fact, how this person likes to work. Call list_projects to see the keys.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "set_thread",
    description:
      "Record where work stands, so the next session — on any machine, in any " +
      "assistant — opens knowing what was in flight. One or two sentences: what " +
      "is unverified, what comes next, what is blocked. Call it when a " +
      "conversation reaches a stopping point or when what happens next changes. " +
      "This REPLACES the previous line rather than adding to it, so write the " +
      "current state, not a history. Use remember for durable conclusions; this " +
      "is for the cursor, which is expected to go out of date.",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description: "Where this stands right now, in one or two sentences.",
        },
        project: {
          type: "string",
          description:
            "Which project this thread belongs to, e.g. \"axon\". Omit for work that spans all of them.",
        },
      },
      required: ["state"],
    },
  },
  {
    name: "list_projects",
    description:
      "List the projects this account keeps memory for, with the key to pass as `project` to recall_context and remember. Call this once at the start if you intend to scope anything; an unscoped call is always valid.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_sources",
    description: "List the third-party data sources (Gmail, GitHub, Notion, Slack, etc.) the user has connected to Axon Memory.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tasks",
    description:
      "Read this workspace's build list: what is open, what each task is waiting on, how far the list has got, " +
      "and what is sitting unanswered in the catch box. Call it before you plan work — the person keeps everything " +
      "they have asked for here, and half of it will not be in this conversation.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Workspace key. Omit when the account has only one." },
        all: { type: "boolean", description: "Include finished tasks as well as open ones." },
      },
    },
  },
  {
    name: "mark_built",
    description:
      "Tick `built` on a task once the code exists. Use the task code, e.g. \"C2\". This notifies the person, " +
      "so tick it when it is true and not when you intend it to be.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Task code, e.g. \"M1\"." },
        note: { type: "string", description: "One line on what you changed. Kept with the task." },
        workspace: { type: "string" },
      },
      required: ["code"],
    },
  },
  {
    name: "mark_tested",
    description:
      "Tick `tested` on a task. Only from something you actually ran and read the output of — a green build " +
      "is not a test, and this repository has a ReferenceError in production to prove it.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Task code, e.g. \"M1\"." },
        note: { type: "string", description: "What you measured, and what it said." },
        workspace: { type: "string" },
      },
      required: ["code"],
    },
  },
  {
    name: "add_task",
    description:
      "Add work you found that was not on the list. It gets the next number in the phase you name.",
    inputSchema: {
      type: "object",
      properties: {
        phase: { type: "string", description: "Phase letter, e.g. \"B\". Call list_tasks to see them." },
        title: { type: "string", description: "What has to happen, in a line somebody understands next week." },
        body: { type: "string", description: "Why it matters, and anything the next person needs." },
        workspace: { type: "string" },
      },
      required: ["phase", "title"],
    },
  },
  {
    name: "add_phase",
    description:
      "Open a new phase on the build list, for a body of work the existing letters do not cover. A workspace " +
      "starts with the five it was seeded with and nothing else could ever add one, which is how work ends up " +
      "in a second list outside the product. Call list_tasks first to see which letters are taken.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "One or two letters, e.g. \"F\". Not one that is already taken." },
        title: { type: "string", description: "What this phase is, in a line — e.g. \"The front door\"." },
        note: { type: "string", description: "Why it exists, and what it holds up if it is left alone." },
        colour: { type: "string", description: "Optional hex. Leave it out unless the phase needs its own; gold names AXON and nothing else." },
        workspace: { type: "string" },
      },
      required: ["code", "title"],
    },
  },
  {
    name: "add_catch",
    description:
      "Capture something the person said in passing — an idea, a preference, a thing that annoyed them — even " +
      "when it is not work yet. This is the box that stops ideas dying in a chat transcript, and it is the tool " +
      "you will under-use unless you look for reasons to call it.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The thing itself, in one line." },
        body: { type: "string", description: "Any detail worth keeping." },
        said: { type: "string", description: "Their own words, if the phrasing carries something." },
        workspace: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_work",
    description:
      "What this workspace has laid out for an agent to do. AXON cannot start you — it puts work where you " +
      "will look, so check here when you arrive and before you ask what to do next. Rows marked \"for: you\" " +
      "are addressed to this registration; leave the ones addressed to another client alone.",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Include finished work as well as open and claimed." },
        workspace: { type: "string" },
      },
    },
  },
  {
    name: "claim_work",
    description:
      "Say you are taking a piece of work, before you start it. This account can have several assistants " +
      "connected at once, and without a claim two of them do the same job and neither finds out.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The work id from list_work." } },
      required: ["id"],
    },
  },
  {
    name: "complete_work",
    description:
      "Report what you actually did. Not what you intended and not that it went well — what changed, and " +
      "what you measured. This is the only thing the person sees, so a vague result is the same as no result.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        result: { type: "string", description: "What changed, and how you know." },
      },
      required: ["id", "result"],
    },
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
  const cors = publicCorsHeaders();

  if (req.method !== "POST") {
    return new Response("MCP endpoint: POST JSON-RPC only", { status: 405, headers: cors });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || body.jsonrpc !== "2.0") {
    // Every session so far opens with one of these and nothing recorded what
    // it was. Shape only — never the payload: this endpoint carries a person's
    // memories and a log is the last place they should turn up.
    console.log("mcp: rejected non-JSON-RPC request", JSON.stringify({
      contentType: req.headers.get("content-type"),
      hasBody: body !== null,
      keys: body && typeof body === "object" ? Object.keys(body).slice(0, 8) : null,
    }));
    return new Response(JSON.stringify(rpcError(null, -32600, "Invalid Request")), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { id, method, params } = body as { id: unknown; method: string; params?: Record<string, unknown> };

  // What was asked, and by whom. Without this line a session is four status
  // codes and no way to tell a client that listed the tools from one that
  // tried to use them and failed.
  console.log("mcp:", method, params?.name ? `tool=${params.name}` : "");

  // initialize / notifications need no auth (they carry no user data).
  if (method === "initialize") {
    return json(rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      // Concrete triggers, not "when it seems worth keeping".
      //
      // The previous wording was exactly that, and it was measured against a
      // full day of work: an assistant with this connected called `remember`
      // zero times unprompted. A model cannot recognise "worth keeping"; it can
      // recognise "the user corrected you". Every recall result now repeats
      // this contract in its `how_to_use` field, which is where it lands
      // mid-task rather than once at connect time.
      instructions:
        "This user's memory is shared across every AI assistant they connect. " +
        "Call recall_context before answering the first substantive question, " +
        "passing the project you are working in if you know it — an unscoped " +
        "recall answers with whichever codebase is largest. " +
        "Call remember when the user states a preference, settles a decision, " +
        "corrects you, or explains why something is done a particular way: save " +
        "the reason, not the change. Do not save progress reports or summaries " +
        "of the conversation. What you save is read by their other assistants, " +
        "including ones they have not opened yet. " +
        "Call set_thread when the conversation reaches a stopping point, so the " +
        "next session — on any machine — opens knowing what was in flight. " +
        "This account keeps one build list: call list_tasks before planning work, " +
        "mark_built when the code exists, mark_tested only for what you actually " +
        "ran, and add_catch for anything they mention in passing. Ticking a box " +
        "tells them what happened without them having to ask.",
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

    /* A ceiling, per key.
     *
     * This host is public because an assistant has to reach it without a
     * browser, and until now nothing counted the calls. One `while true` in
     * somebody's script is an embedding bill and a database under load, and the
     * first anybody would know is the invoice.
     *
     * Sixty a minute is far above how an assistant actually works — a recall
     * happens at the top of a task, not in a loop — and far below what a
     * runaway costs. Only tools/call is counted: initialize and tools/list are
     * cheap and are what a client does while connecting.
     *
     * A refusal is a JSON-RPC error with HTTP 200, not a 429. A transport-level
     * status here is read by MCP clients as the server being broken, and this
     * server is working exactly as intended. */
    const { data: gate } = await admin.rpc("take_rate_limit_token", {
      p_api_key_id: resolved.apiKeyId,
      p_window_seconds: 60,
      p_limit: 60,
    });
    const verdict = Array.isArray(gate) ? gate[0] : gate;
    if (verdict && verdict.allowed === false) {
      console.log(`mcp: rate limited key ${resolved.apiKeyId} at ${verdict.calls} calls`);
      return json(
        rpcError(
          id,
          -32000,
          `Too many calls — 60 a minute per registration. This one has made ${verdict.calls}. Try again after ${verdict.resets_at}.`,
        ),
        cors,
      );
    }

    try {
      if (!toolName) {
        console.log("mcp: tools/call with no tool name");
      }
      if (toolName === "recall_context") {
        const pack = await buildContextPack(admin, resolved.userId, {
          query: (args.query as string) ?? null,
          tokenBudget: (args.token_budget as number) ?? undefined,
          project: (args.project as string) ?? null,
          apiKeyId: resolved.apiKeyId,
          // What the client called itself when it registered. This is the only
          // point in the system that knows WHICH assistant is reading, so it is
          // the only point that can record a memory crossing between apps.
          clientLabel: resolved.clientLabel,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(pack, null, 2) }] }), cors);
      }

      if (toolName === "remember") {
        const saved = await rememberMemory(admin, resolved.userId, {
          content: args.content as string,
          title: (args.title as string) ?? null,
          tags: (args.tags as string[]) ?? [],
          source_label: sourceLabelFor(args, resolved),
          project: (args.project as string) ?? null,
          api_key_id: resolved.apiKeyId ?? null,
        });
        return json(
          rpcResult(id, {
            content: [{ type: "text", text: `Saved to Axon Memory (id: ${saved.id}). This is now visible to every AI assistant connected to this account.` }],
          }),
          cors,
        );
      }

      if (toolName === "set_thread") {
        const state = typeof args?.state === "string" ? args.state.trim() : "";
        if (!state) {
          return json(rpcResult(id, {
            content: [{ type: "text", text: "state is required." }],
            isError: true,
          }), cors);
        }
        const projectId = await resolveProjectId(
          admin,
          resolved.userId,
          // args is whatever a client put in a JSON-RPC payload; narrowed here
          // rather than trusted.
          typeof args?.project === "string" ? args.project : null,
        );
        // Upsert by hand rather than by onConflict: the uniqueness is an
        // expression index over coalesce(project_id, ...), because NULLs are
        // distinct in a plain constraint and the account-wide thread would
        // quietly accept duplicates. PostgREST's on_conflict cannot name an
        // expression index.
        const lookup = admin.from("project_threads").select("id")
          .eq("user_id", resolved.userId);
        const existing = await (projectId
          ? lookup.eq("project_id", projectId)
          : lookup.is("project_id", null)
        ).maybeSingle();

        const row = {
          user_id: resolved.userId,
          project_id: projectId,
          state: state.slice(0, 2000),
          updated_by: resolved.clientLabel ?? null,
          updated_at: new Date().toISOString(),
        };
        const { error } = existing.data?.id
          ? await admin.from("project_threads").update(row).eq("id", existing.data.id)
          : await admin.from("project_threads").insert(row);
        if (error) {
          return json(rpcResult(id, {
            content: [{ type: "text", text: `Could not save: ${error.message}` }],
            isError: true,
          }), cors);
        }
        return json(rpcResult(id, {
          content: [{
            type: "text",
            text: `Thread updated${args?.project ? ` for ${args.project}` : ""}. The next session on any machine opens with this.`,
          }],
        }), cors);
      }

      if (toolName === "list_projects") {
        const { data: projects } = await admin
          .from("projects")
          .select("key, name")
          .eq("user_id", resolved.userId)
          .order("name");
        return json(
          rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(projects ?? [], null, 2) }],
          }),
          cors,
        );
      }

      if (toolName === "list_tasks") {
        const out = await listTasks(admin, resolved.userId, {
          workspace: (args.workspace as string) ?? null,
          all: args.all === true,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] }), cors);
      }

      if (toolName === "mark_built" || toolName === "mark_tested") {
        const out = await markTask(admin, resolved.userId, {
          code: String(args.code ?? ""),
          workspace: (args.workspace as string) ?? null,
          field: toolName === "mark_built" ? "built" : "tested",
          actor: resolved.clientLabel ?? null,
          note: (args.note as string) ?? null,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: out.text }] }), cors);
      }

      if (toolName === "add_phase") {
        const out = await addPhase(admin, resolved.userId, {
          code: String(args.code ?? ""),
          title: String(args.title ?? ""),
          note: (args.note as string) ?? null,
          colour: (args.colour as string) ?? null,
          workspace: (args.workspace as string) ?? null,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: out.text }] }), cors);
      }

      if (toolName === "add_task") {
        const out = await addTask(admin, resolved.userId, {
          phase: String(args.phase ?? ""),
          title: String(args.title ?? ""),
          body: (args.body as string) ?? null,
          workspace: (args.workspace as string) ?? null,
          actor: resolved.clientLabel ?? null,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: out.text }] }), cors);
      }

      if (toolName === "list_work") {
        const out = await listWork(admin, resolved.userId, {
          workspace: (args.workspace as string) ?? null,
          all: !!args.all,
          apiKeyId: resolved.apiKeyId ?? null,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] }), cors);
      }

      if (toolName === "claim_work") {
        const out = await claimWork(admin, resolved.userId, {
          id: String(args.id ?? ""),
          apiKeyId: resolved.apiKeyId ?? null,
        });
        return json(rpcResult(id, {
          content: [{ type: "text", text: `Taken: "${out.claimed}". Report with complete_work when it is done.` }],
        }), cors);
      }

      if (toolName === "complete_work") {
        const out = await completeWork(admin, resolved.userId, {
          id: String(args.id ?? ""),
          result: String(args.result ?? ""),
          apiKeyId: resolved.apiKeyId ?? null,
        });
        return json(rpcResult(id, {
          content: [{ type: "text", text: `Done: "${out.done}". The person sees your result without having to ask.` }],
        }), cors);
      }

      if (toolName === "add_catch") {
        const out = await addCatch(admin, resolved.userId, {
          title: String(args.title ?? ""),
          body: (args.body as string) ?? null,
          said: (args.said as string) ?? null,
          workspace: (args.workspace as string) ?? null,
          actor: resolved.clientLabel ?? null,
        });
        return json(rpcResult(id, { content: [{ type: "text", text: out.text }] }), cors);
      }

      if (toolName === "list_sources") {
        const sources = await listSourcesForUser(admin, resolved.userId);
        return json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(sources, null, 2) }] }), cors);
      }

      return json(rpcError(id, -32601, `Unknown tool: ${toolName}`), cors);
    } catch (err) {
      console.error("mcp-server tools/call error", err);
      /* 200, not 500.
         A JSON-RPC error belongs in the payload; the transport succeeded. A
         client that sees a 5xx never reads the body, so every failure inside a
         tool arrived at the person as "the connector's server isn't
         responding" — which is both untrue and unactionable. It was true of
         list_tasks, mark_built and mark_tested for a whole day while
         recall_context worked beside them, and the message said nothing about
         which of them, or why.
         The error object still carries the code and the message; only the
         status changes, so the client can show what actually went wrong. */
      return json(rpcError(id, -32000, err instanceof Error ? err.message : "Internal error"), cors);
    }
  }

  return json(rpcError(id, -32601, `Unknown method: ${method}`), cors, 400);
});

function json(payload: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "content-type": "application/json" } });
}

function unauthorized(cors: Record<string, string>) {
  const resourceOrigin = mcpOrigin();
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" } }), {
    status: 401,
    headers: {
      ...cors,
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${resourceOrigin}/.well-known/oauth-protected-resource"`,
    },
  });
}
