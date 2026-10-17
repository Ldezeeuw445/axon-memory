// MCP lifecycle surface (A6-1): the canonical verbs Capture / Recall / Retire /
// Restore / Supersede / Delete (spec §18, Lexicon §3).
//
// capture and recall are the canonical names for the existing remember and
// recall_context tools: same handler, same auth, both names stay. The four
// lifecycle tools go through _shared/lifecycle.ts → the tenant-checked SQL
// functions, so the owner is always the one the bearer token resolved to.
import { deleteMemory, LifecycleError, restoreMemory, retireMemory, supersedeMemory, type Rpc } from "./lifecycle.ts";

export const TOOL_ALIASES: Record<string, string> = { capture: "remember", recall: "recall_context" };

const idProp = { type: "string", description: "The memory's id, as returned by recall (every memory in a recall carries one)." };

export function lifecycleTools(remember: { inputSchema: unknown }, recallContext: { inputSchema: unknown }) {
  return [
    {
      name: "capture",
      description:
        "Capture a memory: the canonical name for remember. Keeps a fact, preference, decision or reason so every " +
        "assistant connected to this account has it. Save the reason, not the change; not for progress reports.",
      inputSchema: remember.inputSchema,
    },
    {
      name: "recall",
      description:
        "Recall: the canonical name for recall_context. Brings back what this person already told any connected " +
        "assistant or app. Each memory in the result carries an id for retire / supersede / delete.",
      inputSchema: recallContext.inputSchema,
    },
    {
      name: "retire",
      description:
        "Retire a memory that is no longer true or no longer matters. It stops appearing in recall, conclusions " +
        "drawn only from it are withdrawn, and it is kept (restore brings it back). Use when the person says " +
        "something stopped being the case.",
      inputSchema: {
        type: "object",
        properties: { id: idProp, reason: { type: "string", description: "Optional: why, in a few words." } },
        required: ["id"],
      },
    },
    {
      name: "restore",
      description: "Restore a retired or superseded memory to active recall.",
      inputSchema: { type: "object", properties: { id: idProp }, required: ["id"] },
    },
    {
      name: "supersede",
      description:
        "Replace an older memory with newer truth without falsifying history. Pass old_id and either new_id (an " +
        "existing memory) or content (captured now as the new memory). The old one leaves recall and is kept as " +
        "the previous state, linked to the new one.",
      inputSchema: {
        type: "object",
        properties: {
          old_id: idProp,
          new_id: { type: "string", description: "Id of the memory that replaces it. Omit when passing content." },
          content: { type: "string", description: "The new statement, captured as a memory and used as the replacement." },
          project: { type: "string", description: "Project key for the new memory, when content is passed." },
          reason: { type: "string", description: "Optional: what changed." },
        },
        required: ["old_id"],
      },
    },
    {
      name: "delete",
      description:
        "Permanently delete a memory and everything derived from it (search index, vector, entity links, " +
        "conclusions drawn only from it). Cannot be undone. Only when the person explicitly asks for it to be " +
        "gone; otherwise retire. Requires confirm: true.",
      inputSchema: {
        type: "object",
        properties: { id: idProp, confirm: { type: "boolean", description: "Must be true. Confirms the person asked for permanent deletion." } },
        required: ["id", "confirm"],
      },
    },
  ];
}

export const LIFECYCLE_TOOL_NAMES = new Set(["retire", "restore", "supersede", "delete"]);

/** Personal keys carry no scope (full access to their own account); OAuth grants list scopes. */
export function canWrite(scope: string | null | undefined): boolean {
  if (!scope || !scope.trim()) return true;
  return scope.split(/[\s,]+/).includes("memory.write");
}

export type ToolOutcome = { text: string; isError?: boolean };

export async function handleLifecycleTool(
  admin: Rpc,
  resolved: { userId: string; scope: string | null; clientLabel: string | null },
  toolName: string,
  args: Record<string, unknown>,
  capture: (content: string, project: string | null) => Promise<{ id: string }>,
): Promise<ToolOutcome> {
  if (!canWrite(resolved.scope)) {
    return { text: "This connection was granted read-only access (no memory.write scope). Reconnect with write access to change memories.", isError: true };
  }
  const actor = resolved.clientLabel ?? null;
  try {
    if (toolName === "retire") {
      const r = await retireMemory(admin, resolved.userId, args.id, { reason: str(args.reason), actor });
      return { text: r.changed === false ? `Already out of recall (${r.lifecycle_state}). Nothing changed.` : `Retired ${r.id}. It no longer appears in recall; ${r.facts_withdrawn ?? 0} conclusion(s) drawn only from it were withdrawn. restore brings it back.` };
    }
    if (toolName === "restore") {
      const r = await restoreMemory(admin, resolved.userId, args.id, { actor });
      return { text: r.changed === false ? "Already active. Nothing changed." : `Restored ${r.id} to active recall.` };
    }
    if (toolName === "supersede") {
      let newId = str(args.new_id);
      const content = str(args.content);
      if (!newId && !content) return { text: "Pass new_id (an existing memory) or content (the new statement).", isError: true };
      if (newId && content) return { text: "Pass new_id or content, not both.", isError: true };
      if (!newId) newId = (await capture(content!, str(args.project))).id;
      const r = await supersedeMemory(admin, resolved.userId, args.old_id, newId, { reason: str(args.reason), actor });
      return { text: r.changed === false ? `Already superseded by ${newId}. Nothing changed.` : `Superseded ${r.old} with ${r.new}. The old memory is kept as history and no longer appears in recall.` };
    }
    if (toolName === "delete") {
      if (args.confirm !== true) {
        return { text: "Not deleted. Permanent deletion needs confirm: true, and only when the person asked for it. To take a memory out of recall but keep it, use retire.", isError: true };
      }
      const r = await deleteMemory(admin, resolved.userId, args.id, { actor });
      return { text: `Deleted ${r.id} permanently: removed with ${r.embeddings ?? 0} vector(s), ${r.entity_links ?? 0} entity link(s), ${r.facts_deleted ?? 0} conclusion(s) drawn only from it, ${r.recalls ?? 0} recall record(s).` };
    }
    return { text: `Unknown lifecycle tool: ${toolName}`, isError: true };
  } catch (err) {
    if (err instanceof LifecycleError) return { text: err.message, isError: true };
    throw err;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
