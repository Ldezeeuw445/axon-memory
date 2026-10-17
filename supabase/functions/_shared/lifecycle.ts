// Lifecycle operations (A4-1): Retire, Restore, Supersede, Delete.
//
// Thin wrappers over the SQL functions in 20261017101436_memory_lifecycle.sql so
// every caller (MCP, REST, app) goes through the same tenant-checked path. The
// edge functions hold the service role, so the owner is passed explicitly as
// p_user_id. lifecycle_owner() requires it and every function filters on it.

export class LifecycleError extends Error {
  constructor(message: string, readonly code: "not_found" | "invalid" | "forbidden" | "failed") {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertMemoryId(v: unknown, field = "id"): string {
  if (typeof v !== "string" || !UUID.test(v.trim())) {
    throw new LifecycleError(`${field} must be a memory id (uuid) — recall returns one per memory.`, "invalid");
  }
  return v.trim().toLowerCase();
}

/** The one method used — declared as a method so a SupabaseClient satisfies it (bivariant). */
// deno-lint-ignore no-explicit-any
export interface Rpc { rpc(fn: string, args: any): PromiseLike<{ data: any; error: { code?: string; message: string } | null }> }

async function call(admin: Rpc, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "P0002") throw new LifecycleError("No memory with that id on this account.", "not_found");
    if (code === "22023") throw new LifecycleError(error.message, "invalid");
    if (code === "42501") throw new LifecycleError("Not allowed.", "forbidden");
    throw new LifecycleError(error.message, "failed");
  }
  return (data ?? {}) as Record<string, unknown>;
}

export async function retireMemory(admin: Rpc, userId: string, id: unknown, opts: { reason?: string | null; actor?: string | null } = {}) {
  return await call(admin, "memory_retire", {
    p_memory_id: assertMemoryId(id), p_reason: opts.reason?.trim() || "user", p_actor: opts.actor ?? null, p_user_id: userId,
  });
}

export async function restoreMemory(admin: Rpc, userId: string, id: unknown, opts: { actor?: string | null } = {}) {
  return await call(admin, "memory_restore", { p_memory_id: assertMemoryId(id), p_actor: opts.actor ?? null, p_user_id: userId });
}

export async function supersedeMemory(admin: Rpc, userId: string, oldId: unknown, newId: unknown, opts: { reason?: string | null; actor?: string | null } = {}) {
  return await call(admin, "memory_supersede", {
    p_old_id: assertMemoryId(oldId, "old_id"), p_new_id: assertMemoryId(newId, "new_id"),
    p_reason: opts.reason?.trim() || null, p_actor: opts.actor ?? null, p_user_id: userId,
  });
}

export async function deleteMemory(admin: Rpc, userId: string, id: unknown, opts: { actor?: string | null } = {}) {
  return await call(admin, "memory_delete", { p_memory_id: assertMemoryId(id), p_actor: opts.actor ?? null, p_user_id: userId });
}
