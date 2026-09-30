/**
 * The build list, from an agent's side.
 *
 * ## Why the agents keep it and not the person
 *
 * A checklist somebody has to maintain by hand is a checklist that is wrong by
 * Wednesday. The agent that wrote the code is the only party that knows the
 * moment it exists, and the only one that knows whether anybody measured it —
 * so it ticks the boxes, and the person finds out rather than asks.
 *
 * ## Why built and tested are two boxes
 *
 * They are two different claims. "The code exists" has never once proved "it
 * works", and this repository has a ReferenceError in production to show for
 * it. An agent may tick `built` from its own diff; it may only tick `tested`
 * from something it ran and read the output of.
 *
 * Every tick writes a row in `workspace_events` through a database trigger, so
 * a notification appears whether the tick came from here, from the app, or from
 * a tool nobody has written yet.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Workspace = { id: string; key: string; name: string; colour: string };

/**
 * The workspace being worked in. Named if the caller named one; otherwise the
 * only one, and an error when there is a choice to be made — silently picking
 * for somebody is how work lands in the wrong place.
 */
export async function resolveWorkspace(
  admin: SupabaseClient,
  userId: string,
  key?: string | null,
): Promise<Workspace> {
  const q = admin.from("workspaces").select("id, key, name, colour").eq("user_id", userId);
  if (key) {
    const { data } = await q.eq("key", key).maybeSingle();
    if (!data) throw new Error(`No workspace with key "${key}". Call list_tasks with no arguments to see what exists.`);
    return data as Workspace;
  }
  const { data } = await q.order("created_at", { ascending: true });
  const rows = (data ?? []) as Workspace[];
  if (rows.length === 0) {
    throw new Error("This account has no workspace yet. The person creates one in AXON under Chat.");
  }
  if (rows.length > 1) {
    throw new Error(
      `This account has several workspaces (${rows.map((r) => r.key).join(", ")}). Pass one as \`workspace\`.`,
    );
  }
  return rows[0];
}

type TaskRow = {
  code: string; phase_code: string; number: number; title: string; body: string | null;
  tag: string | null; built: boolean; tested: boolean; built_by: string | null;
  tested_by: string | null; blocked_by: string | null; value: number; effort: number;
};

/** Everything open, plus what is finished, plus what is waiting on what. */
export async function listTasks(
  admin: SupabaseClient,
  userId: string,
  opts: { workspace?: string | null; all?: boolean },
) {
  const ws = await resolveWorkspace(admin, userId, opts.workspace);

  const [{ data: phases }, { data: tasks }, { data: progress }, { data: openCatch }] = await Promise.all([
    admin.from("workspace_phases").select("code, title, note, colour")
      .eq("workspace_id", ws.id).order("position"),
    admin.from("workspace_tasks")
      .select("code, phase_code, number, title, body, tag, built, tested, built_by, tested_by, blocked_by, value, effort")
      .eq("workspace_id", ws.id).order("phase_code").order("number"),
    admin.from("workspace_progress").select("*").eq("workspace_id", ws.id).maybeSingle(),
    admin.from("workspace_catch").select("title, state, task_code, created_at")
      .eq("workspace_id", ws.id).neq("state", "done").order("created_at", { ascending: false }).limit(20),
  ]);

  const rows = (tasks ?? []) as TaskRow[];
  const done = new Set(rows.filter((t) => t.built && t.tested).map((t) => t.code));

  const shape = (t: TaskRow) => ({
    code: t.code,
    title: t.title,
    detail: t.body ?? undefined,
    built: t.built,
    tested: t.tested,
    by: [t.built_by && `built by ${t.built_by}`, t.tested_by && `tested by ${t.tested_by}`]
      .filter(Boolean).join(", ") || undefined,
    waiting_on: t.blocked_by && !done.has(t.blocked_by) ? t.blocked_by : undefined,
  });

  const open = rows.filter((t) => !(t.built && t.tested));

  return {
    workspace: { key: ws.key, name: ws.name },
    progress: progress
      ? {
        build_list: `${progress.build_pct}% — ${progress.tasks_built}/${progress.tasks} built, ${progress.tasks_tested}/${progress.tasks} tested`,
        catch_box: `${progress.catch_pct}% — ${progress.catch_done}/${progress.catch_total} answered`,
      }
      : undefined,
    phases: (phases ?? []).map((p: { code: string; title: string; note: string | null }) => ({
      code: p.code, title: p.title, why: p.note ?? undefined,
    })),
    open: open.map(shape),
    finished: opts.all ? rows.filter((t) => t.built && t.tested).map(shape) : undefined,
    catch_box_open: (openCatch ?? []).map((c: { title: string; state: string; task_code: string | null }) => ({
      said: c.title, state: c.state, task: c.task_code ?? undefined,
    })),
    how_to_use:
      "Tick `built` from your own diff. Tick `tested` only from something you ran and read the output of — " +
      "a green build is not a test. Anything the person says in passing that is worth keeping goes to add_catch, " +
      "even when it is not work yet.",
  };
}

/** One task, ticked. Returns what the person will be told. */
export async function markTask(
  admin: SupabaseClient,
  userId: string,
  opts: { code: string; workspace?: string | null; field: "built" | "tested"; actor: string | null; note?: string | null },
) {
  const ws = await resolveWorkspace(admin, userId, opts.workspace);
  const code = opts.code.trim().toUpperCase();

  const { data: task } = await admin.from("workspace_tasks")
    .select("id, code, title, built, tested, body")
    .eq("workspace_id", ws.id).eq("code", code).maybeSingle();
  if (!task) throw new Error(`No task ${code} in ${ws.key}. Call list_tasks to see the codes.`);

  if (task[opts.field]) {
    return { text: `${code} was already marked ${opts.field}. Nothing changed.` };
  }

  const patch: Record<string, unknown> = { [opts.field]: true, [`${opts.field}_by`]: opts.actor ?? "an agent" };
  // A note about how it was verified belongs with the task, not in a log line
  // the person will never open.
  if (opts.note) {
    patch.body = `${task.body ? task.body + "\n\n" : ""}${opts.field === "tested" ? "Verified" : "Built"}: ${opts.note}`;
  }

  const { error } = await admin.from("workspace_tasks").update(patch).eq("id", task.id);
  if (error) throw new Error(error.message);

  const complete = opts.field === "built" ? task.tested : task.built;
  return {
    text: complete
      ? `${code} — ${task.title} is now built and tested. The person has been notified.`
      : `${code} — ${task.title} marked ${opts.field}. Still needs ${opts.field === "built" ? "testing" : "building"}.`,
  };
}

/** Work an agent found that was not on the list. Gets the next free number. */
/**
 * A new phase on the list.
 *
 * ## Why this was missing, and what it cost
 *
 * A workspace was born with the five phases the seeding gives it and could
 * never have a sixth: the app never writes to workspace_phases and the tools
 * only had add_task, which refuses a phase that does not exist. So the moment
 * somebody had a body of work the seed did not anticipate — the landing page,
 * in this account's case — it had nowhere to go, and it ended up in a second
 * list outside the product. That is how "one list, and no second one" got
 * broken: not by choosing to, but by not being able to.
 *
 * ## Why an agent may do this
 *
 * The same argument as the ticking. The party that finds the work is the party
 * that knows a new phase is needed, and asking the person to go and create one
 * first is the friction that puts the work in a text file instead.
 *
 * A phase is a letter, so the space is small and worth protecting: taken codes
 * are rejected by name rather than by a unique-constraint error, and the letter
 * is checked against the shape the column allows before the insert rather than
 * after it.
 */
export async function addPhase(
  admin: SupabaseClient,
  userId: string,
  opts: { code: string; title: string; note?: string | null; colour?: string | null; workspace?: string | null },
) {
  const ws = await resolveWorkspace(admin, userId, opts.workspace);
  const code = opts.code.trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(code)) {
    throw new Error(`"${opts.code}" is not a phase code. One or two letters, e.g. "F".`);
  }

  const { data: taken } = await admin.from("workspace_phases")
    .select("code, title").eq("workspace_id", ws.id);
  const clash = (taken ?? []).find((p: { code: string }) => p.code === code);
  if (clash) {
    throw new Error(
      `Phase "${code}" already exists in ${ws.key} — ${(clash as { title: string }).title}. ` +
      `Add to it with add_task, or pick another letter. Taken: ` +
      `${(taken ?? []).map((p: { code: string }) => p.code).sort().join(", ")}.`,
    );
  }

  const { data: last } = await admin.from("workspace_phases")
    .select("position").eq("workspace_id", ws.id)
    .order("position", { ascending: false }).limit(1).maybeSingle();

  const { error } = await admin.from("workspace_phases").insert({
    workspace_id: ws.id, user_id: userId, code,
    title: opts.title.slice(0, 200), note: opts.note ?? null,
    /* Gold names AXON and nothing else, so a phase that does not choose gets
       the neutral grey the column already defaults to rather than borrowing a
       colour that means something elsewhere on the map. */
    ...(opts.colour ? { colour: opts.colour } : {}),
    position: (last?.position ?? 0) + 1,
  });
  if (error) throw new Error(error.message);

  return { text: `Added phase ${code} — ${opts.title}. Put work in it with add_task.` };
}

/**
 * A line somebody else can read a week from now.
 *
 * `slice(0, 200)` put a whole pasted request on the axe-core list, cut off
 * mid-word: "…every model connected, how its connect what the model does I want
 * th". The list is the one place a line has to be readable by a stranger, and
 * truncating to a fixed number of characters is the single option that cannot
 * produce one.
 *
 * So it refuses, rather than guessing. Writing a title out of somebody's
 * paragraph means inventing what they meant, and the caller — a model, holding
 * the whole request — is far better placed to do that than a slice(). The
 * refusal carries the first sentence back as a suggestion so the fix is one
 * step, and says where the long text belongs: `body`, which has no limit and is
 * shown when the task is opened.
 */
const TITLE_MAX = 120;

// Exported for the Deno test suite. This rule is the one thing standing
// between a pasted paragraph and the list, and it earned a test the day a
// 215-character request became a task title cut off mid-word.
export function cleanTitle(raw: string): { title: string } | { error: string } {
  const flat = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return { error: "A task needs a title. Pass one, and put the detail in body." };
  if (flat.length <= TITLE_MAX) return { title: flat };

  // The first sentence, or the first clause, whichever comes first — offered
  // back rather than applied, because a suggestion the caller accepts is a
  // title somebody chose and a suggestion applied silently is another slice().
  const stop = flat.search(/[.!?](\s|$)/);
  const first = stop > 0 && stop < TITLE_MAX ? flat.slice(0, stop) : flat.slice(0, TITLE_MAX).replace(/\s+\S*$/, "");
  return {
    error:
      `That title is ${flat.length} characters and the list needs one a person can read at a glance ` +
      `(${TITLE_MAX} at most). It looks like the whole request went into the title. ` +
      `Call add_task again with the request in body and a title such as: "${first}"`,
  };
}

export async function addTask(
  admin: SupabaseClient,
  userId: string,
  opts: { phase: string; title: string; body?: string | null; workspace?: string | null; actor: string | null },
) {
  const ws = await resolveWorkspace(admin, userId, opts.workspace);
  const phase = opts.phase.trim().toUpperCase();

  const { data: exists } = await admin.from("workspace_phases")
    .select("code").eq("workspace_id", ws.id).eq("code", phase).maybeSingle();
  if (!exists) throw new Error(`No phase "${phase}" in ${ws.key}. Call list_tasks to see the phases.`);

  const { data: last } = await admin.from("workspace_tasks")
    .select("number").eq("workspace_id", ws.id).eq("phase_code", phase)
    .order("number", { ascending: false }).limit(1).maybeSingle();
  const number = (last?.number ?? 0) + 1;

  const named = cleanTitle(opts.title);
  if ("error" in named) throw new Error(named.error);

  const { data, error } = await admin.from("workspace_tasks").insert({
    workspace_id: ws.id, user_id: userId, phase_code: phase, number,
    title: named.title, body: opts.body ?? null, built_by: opts.actor,
  }).select("code").single();
  if (error) throw new Error(error.message);

  return { text: `Added ${data.code} — ${named.title}` };
}

/** Something said in passing. Not work yet, and that is the point. */
export async function addCatch(
  admin: SupabaseClient,
  userId: string,
  opts: { title: string; body?: string | null; said?: string | null; workspace?: string | null; actor: string | null },
) {
  const ws = await resolveWorkspace(admin, userId, opts.workspace);
  const { error } = await admin.from("workspace_catch").insert({
    workspace_id: ws.id, user_id: userId,
    title: opts.title.slice(0, 300),
    body: opts.body ?? null,
    said: opts.said ?? null,
    source: opts.actor,
  });
  if (error) throw new Error(error.message);
  return { text: `Caught: "${opts.title}". It is in the box now, so it survives this conversation.` };
}

/**
 * The work a workspace has laid out, and the two calls that move it.
 *
 * ## Why an agent takes work rather than being given it
 *
 * AXON cannot start anything. An MCP client dials in, so the server can never
 * dial out — there is no way to hand a task to an assistant that is not
 * currently talking. Everything here is therefore written for the agent that
 * turns up: it asks what is open, it says which one it is taking, and it says
 * what it did. Nothing waits on a runner that does not exist.
 *
 * ## Why claiming is a compare-and-set
 *
 * Two assistants on one account is the normal case here, not the exotic one —
 * this account has three registrations of the same app. If claiming were a
 * plain update, both would report success on the same row and one of them would
 * silently do work somebody else was already doing. The update is conditioned on
 * the row still being open, and a claim that changes nothing comes back as a
 * refusal rather than as a lie.
 */
export async function listWork(
  admin: SupabaseClient,
  userId: string,
  opts: { workspace?: string | null; all?: boolean; apiKeyId?: string | null },
) {
  const ws = await resolveWorkspace(admin, userId, opts.workspace);
  const COLS =
    "id, workspace_id, title, body, target_kind, target_ref, assignee_key_id, assignee_role, model, state, claimed_by, claimed_at, done_at, result";
  const states = ["open", "claimed"];

  /* Work follows its target, not the room it was written in.
  
     A workspace for the company holds all four apps; a workspace for one app
     holds that one. Aiming work at project axe-core from the company workspace
     used to put it somewhere the agent working on AXE Core would never look,
     because this read filtered on workspace_id alone. So the person doing the
     orchestrating and the assistant doing the work had to be standing in the
     same room, which is the opposite of a pull model.
  
     The rule instead: a workspace sees work aimed at anything it holds. It runs
     both ways without a second mechanism — the company workspace links all four
     projects, so it also sees work laid out inside any of them. */
  const { data: links } = await admin.from("workspace_links")
    .select("kind, ref").eq("workspace_id", ws.id);

  const own = admin.from("workspace_work").select(COLS)
    .eq("workspace_id", ws.id).order("position");
  const aimedHere = (links ?? []).length
    ? admin.from("workspace_work").select(COLS)
        .eq("user_id", userId)
        .neq("workspace_id", ws.id)
        .in("target_kind", [...new Set((links ?? []).map((l) => l.kind))])
        .in("target_ref", [...new Set((links ?? []).map((l) => l.ref))])
        .order("position")
    : null;

  const [ownRes, aimedRes] = await Promise.all([
    opts.all ? own : own.in("state", states),
    aimedHere ? (opts.all ? aimedHere : aimedHere.in("state", states)) : Promise.resolve({ data: [] }),
  ]);

  /* The kind/ref pairs have to match together — `.in` on each column
     separately would let a repo called the same as a project through. Cheap to
     do here and not worth a second round trip to express in SQL. */
  const held = new Set((links ?? []).map((l) => `${l.kind}:${l.ref}`));
  const elsewhere = ((aimedRes as { data: unknown[] }).data ?? []).filter(
    (w) => held.has(`${(w as { target_kind: string }).target_kind}:${(w as { target_ref: string }).target_ref}`),
  );

  const seen = new Set<string>();
  const rows = [...((ownRes as { data: unknown[] }).data ?? []), ...elsewhere]
    .filter((w) => {
      const id = (w as { id: string }).id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }) as Record<string, unknown>[];

  /* Named, so a row that arrived from another workspace says so. An agent
     acting on work it cannot see the origin of is how the same thing gets done
     twice in two rooms. */
  const { data: allSpaces } = await admin.from("workspaces")
    .select("id, name").eq("user_id", userId);
  const spaceName = (id: string) =>
    (allSpaces ?? []).find((x: { id: string }) => x.id === id)?.name ?? null;

  const { data: keys } = await admin.from("api_keys")
    .select("id, name").eq("user_id", userId).is("revoked_at", null);
  // Takes unknown because that is what a PostgREST row actually hands over —
  // saying `string | null` and being given `{}` is how these two call sites
  // typechecked as wrong for as long as nothing checked them.
  const nameOf = (id: unknown) =>
    (typeof id === "string" && id && (keys ?? []).find((k) => k.id === id)?.name) || null;

  return {
    workspace: { key: ws.key, name: ws.name },
    /* Said plainly, because an agent reading this has to know whether a row is
       addressed to it. "for you" is the only case it should act on without
       asking; "for Claude Code (mini)" tells it to leave that one alone. */
    you_are: nameOf(opts.apiKeyId ?? null) ?? "an unidentified client",
    work: rows.map((w) => ({
      id: w.id,
      title: w.title,
      detail: w.body ?? undefined,
      about: w.target_kind ? `${w.target_kind}: ${w.target_ref}` : undefined,
      laid_out_in: w.workspace_id === ws.id ? undefined : (spaceName(w.workspace_id as string) ?? undefined),
      for: w.assignee_key_id
        ? (w.assignee_key_id === opts.apiKeyId ? "you" : nameOf(w.assignee_key_id) ?? "another client")
        : w.assignee_role ?? "anyone",
      model: w.model ?? undefined,
      state: w.state,
      claimed_by: nameOf(w.claimed_by),
      result: w.result ?? undefined,
    })),
    how_to_use:
      "Take one with claim_work before starting, so a second assistant on this account does not repeat it. " +
      "Report with complete_work and say what you actually did — a row with no result is a task nobody can tell was done. " +
      "A row with `laid_out_in` was aimed at something this workspace holds from somewhere else on the account; " +
      "it is yours to take, and the person who laid it out will see it come back.",
  };
}

export async function claimWork(
  admin: SupabaseClient,
  userId: string,
  opts: { id: string; apiKeyId?: string | null },
) {
  const { data, error } = await admin.from("workspace_work")
    .update({
      state: "claimed",
      claimed_by: opts.apiKeyId ?? null,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", opts.id).eq("user_id", userId).eq("state", "open")
    .select("id, title").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "That work is not open — somebody has already taken it, or it is finished. Call list_work again.",
    );
  }
  return { claimed: data.title, id: data.id };
}

export async function completeWork(
  admin: SupabaseClient,
  userId: string,
  opts: { id: string; result: string; apiKeyId?: string | null },
) {
  if (!opts.result?.trim()) {
    throw new Error("Say what you did. A result is the only thing that makes this row worth having.");
  }
  const { data, error } = await admin.from("workspace_work")
    .update({
      state: "done",
      done_at: new Date().toISOString(),
      result: opts.result.trim(),
      claimed_by: opts.apiKeyId ?? null,
    })
    .eq("id", opts.id).eq("user_id", userId).neq("state", "done")
    .select("id, title").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No open work with that id — it may already be finished.");
  return { done: data.title, id: data.id };
}

/**
 * The open work, shaped for the recall pack.
 *
 * ## Why this exists rather than leaving it to list_tasks
 *
 * The connect-time instruction already tells every client to call `list_tasks`
 * before planning work. It was measured on 2 September and it does not happen:
 * an assistant working a full session on AXE Core never opened the list, and
 * planned around it. That is the same failure the `remember` instruction had,
 * and it was fixed the same way — by repeating the contract inside every recall
 * result, where it lands mid-task instead of once at connect. That fix was only
 * ever applied to `remember` and `set_thread`. This is it applied to the half
 * it was missed on.
 *
 * ## Three rules, because this now runs on every single recall
 *
 * It never throws. `resolveWorkspace` raises when an account has more than one
 * workspace, which is right for a tool call the person can answer and wrong
 * here — recall must not start failing because somebody made a second
 * workspace. That is B8 in a new place, and it is not happening twice.
 *
 * It stays small. Five lines and two counts, never the list. The pack has a
 * token budget and the notes are worth more per character than a task body.
 *
 * It says what it left out, so an assistant treats it as the top of a list
 * rather than as the whole of one.
 */

/**
 * Which workspace a recall for this project belongs to.
 *
 * ## Why not the key
 *
 * It used to be string equality: the workspace whose key matched the project's.
 * Measured on 2 September, that meant a recall for project axe-core got its
 * list and a recall for project axon got nothing — because the workspace was
 * called axon-memory-app. The assistant working on AXON itself was the one
 * without AXON's build list, and nothing on the screen said why. Resolution by
 * spelling is resolution by luck.
 *
 * ## What it reads instead
 *
 * workspace_links already records which projects a workspace covers, as rows of
 * kind 'project'. That is the same fact, stated rather than inferred, and it
 * makes the company workspace work without any naming discipline: a workspace
 * that covers four projects resolves for all four.
 *
 * ## Why the narrowest wins
 *
 * A project is usually covered twice — by the workspace for that app and by the
 * one for the company. An assistant working on AXE Core wants AXE Core's list,
 * not the whole firm's, so the workspace covering the fewest projects wins.
 * Breadth is the measure because it is the one that says "this is about one
 * thing" without anybody having to mark it.
 */
async function workspaceForProject(
  admin: SupabaseClient,
  userId: string,
  project?: string | null,
): Promise<{ ws: Workspace | null; spaces: Workspace[] }> {
  const { data } = await admin
    .from("workspaces").select("id, key, name, colour").eq("user_id", userId)
    .order("created_at", { ascending: true });
  const spaces = (data ?? []) as Workspace[];
  if (spaces.length <= 1) return { ws: spaces[0] ?? null, spaces };
  if (!project) return { ws: null, spaces };

  const { data: plinks } = await admin.from("workspace_links")
    .select("workspace_id, ref").eq("user_id", userId).eq("kind", "project");
  const rows = (plinks ?? []) as { workspace_id: string; ref: string }[];

  const breadth = new Map<string, number>();
  rows.forEach((l) => breadth.set(l.workspace_id, (breadth.get(l.workspace_id) ?? 0) + 1));
  const covering = spaces.filter((w) => rows.some((l) => l.workspace_id === w.id && l.ref === project));

  if (covering.length > 0) {
    covering.sort((a, b) => (breadth.get(a.id) ?? 0) - (breadth.get(b.id) ?? 0));
    return { ws: covering[0], spaces };
  }
  /* Nothing claims this project. Fall back to the old spelling match rather
     than returning nothing, so an account that was set up before any of this
     keeps working exactly as it did. */
  return { ws: spaces.find((w) => w.key === project) ?? null, spaces };
}

const NEXT_SHOWN = 5;

type PackTaskRow = {
  code: string; title: string; built: boolean; tested: boolean;
  blocked_by: string | null; value: number; effort: number;
};

export async function openWorkForPack(
  admin: SupabaseClient,
  userId: string,
  project?: string | null,
): Promise<Record<string, unknown> | null> {
  try {
    const { ws, spaces: rows } = await workspaceForProject(admin, userId, project);
    if (rows.length === 0) return null;
    if (!ws) {
      return {
        workspaces: rows.map((r) => r.key),
        note:
          "This account has several workspaces and this recall did not name one. " +
          "Call list_tasks with `workspace` before planning work.",
      };
    }

    const [{ data: tasks }, { data: progress }, { count: catchOpen }] = await Promise.all([
      admin.from("workspace_tasks")
        .select("code, title, built, tested, blocked_by, value, effort")
        .eq("workspace_id", ws.id),
      admin.from("workspace_progress").select("*").eq("workspace_id", ws.id).maybeSingle(),
      admin.from("workspace_catch").select("id", { count: "exact", head: true })
        .eq("workspace_id", ws.id).neq("state", "done"),
    ]);

    const all = (tasks ?? []) as PackTaskRow[];
    const done = new Set(all.filter((t) => t.built && t.tested).map((t) => t.code));
    const open = all.filter((t) => !(t.built && t.tested));

    // The same order the build list itself computes: value over effort, with
    // anything waiting on unfinished work sinking rather than disappearing, so
    // it stays visible what it is waiting for.
    const next = open
      .map((t) => ({ t, waiting: !!t.blocked_by && !done.has(t.blocked_by) }))
      .sort((a, b) =>
        ((b.waiting ? -100 : 0) + b.t.value * 3 - b.t.effort) -
        ((a.waiting ? -100 : 0) + a.t.value * 3 - a.t.effort)
      )
      .slice(0, NEXT_SHOWN)
      .map(({ t, waiting }) => ({
        code: t.code,
        title: t.title,
        ...(waiting ? { waiting_on: t.blocked_by } : {}),
      }));

    return {
      workspace: ws.key,
      ...(progress
        ? {
          progress:
            `${progress.build_pct}% — ${progress.tasks_built}/${progress.tasks} built, ` +
            `${progress.tasks_tested}/${progress.tasks} tested`,
        }
        : {}),
      open: open.length,
      ...(catchOpen ? { catch_box_open: catchOpen } : {}),
      next,
      ...(open.length > next.length
        ? { more: `${open.length - next.length} more open. Call list_tasks for the whole list.` }
        : {}),
    };
  } catch {
    // Never at the cost of the recall itself. A build list that cannot be read
    // is a worse day; a recall that cannot be read is a broken product.
    return null;
  }
}

/**
 * The standing rules, for the recall pack.
 *
 * ## Why only the rules and not the document
 *
 * AGENTS.md is ten kilobytes. Putting it in a pack with a 1,500-token default
 * would eat the budget and push out the notes, which are the most valuable
 * thing in there — a note somebody abandoned this morning beats a paragraph of
 * onboarding prose every time. So this takes the sections that carry rules and
 * leaves the prose in the app, where a person reads it.
 *
 * ## Why verbatim
 *
 * A rule survives paraphrase badly. "AXE_USER_ID belongs in text columns,
 * AXE_USER_UUID in uuid columns, and the wrong one fails silently" distilled
 * into "decided to use suffixed user ids" is a sentence nobody can act on.
 * Conclusions may be summarised; rules are copied.
 *
 * ## The convention, which already existed
 *
 * Every seeded document already has one: AGENTS.md has "Rules that are not
 * visible in the code", ECOSYSTEM.md has "Standards that hold across
 * everything here", ARTIFACT.md has "The one rule about ticking". So the
 * convention is a level-two heading whose words include a rule or a standard,
 * and anybody adding their own only has to name the section that way.
 */
const RULES_HEADING = /^##\s+.*\b(rules?|standards?)\b/i;
export const RULES_CHAR_BUDGET = 900;

function rulesSections(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] | null = null;
  for (const line of markdown.split("\n")) {
    if (/^##\s/.test(line)) {
      if (current) out.push(current.join("\n").trim());
      current = RULES_HEADING.test(line) ? [line] : null;
    } else if (current) {
      current.push(line);
    }
  }
  if (current) out.push(current.join("\n").trim());
  return out.filter(Boolean);
}

export async function standingRulesForPack(
  admin: SupabaseClient,
  userId: string,
  project?: string | null,
): Promise<{ from: string[]; text: string } | null> {
  try {
    // Same resolution as the open work, and for the same reason: rules from the
    // wrong workspace are worse than none.
    const { ws } = await workspaceForProject(admin, userId, project);
    if (!ws) return null;

    const { data: docs } = await admin
      .from("workspace_docs").select("name, content").eq("workspace_id", ws.id).order("name");

    /* And the ones that live in the repositories themselves. A document pasted
       into workspace_docs is a copy, and a copy goes stale — DEEL 0 kept saying
       the kilo worktree was the only real one long after it was not. These are
       read from the default branch on every sync, so editing AGENTS.md in the
       repository is what changes what an assistant is told.
       Scoped to the project when there is one, because a rule from another
       codebase is worse than no rule. */
    let repoDocs: { name: string; content: string }[] = [];
    {
      let q = admin.from("memory_items")
        .select("title, content, project_id, projects!inner(key)")
        .eq("user_id", userId).eq("origin_key", "standing").is("retired_at", null);
      /* Scoped by the project that was asked for, not by the workspace — a
         workspace covers several projects and a rule from the wrong codebase is
         worse than no rule. With no project named, every standing document the
         account has is fair game, which is what an unscoped recall means
         everywhere else here. */
      if (project) q = q.eq("projects.key", project);
      const { data } = await q.order("title").limit(8);
      repoDocs = (data ?? []).map((d: { title: string | null; content: string | null }) => ({
        name: d.title ?? "AGENTS.md",
        content: d.content ?? "",
      }));
    }

    const from: string[] = [];
    const parts: string[] = [];
    let used = 0;
    let dropped = false;

    /* The live file first, and the pasted copy of the same document dropped.
       Ordered the other way the budget was spent on workspace_docs before the
       repository's own AGENTS.md was reached, so the copy crowded out the
       source — which is the exact failure this task exists to end. A copy is
       only worth reading when there is nothing behind it. */
    const liveNames = new Set(repoDocs.map((d) => d.name.split(" · ").pop()));
    const pasted = ((docs ?? []) as { name: string; content: string }[])
      .filter((d) => !liveNames.has(d.name));

    for (const d of [...repoDocs, ...pasted]) {
      for (const section of rulesSections(d.content ?? "")) {
        const room = RULES_CHAR_BUDGET - used;
        if (room < 200) { dropped = true; continue; }

        /* Trimmed to what is left rather than dropped whole. A section longer
           than the entire budget could never be included at any budget, which
           is exactly what happened to the repository's own AGENTS.md: its one
           rules section runs to several thousand characters, so it was skipped
           every time while three short pasted ones fitted. Cut at a paragraph,
           because half a rule is worse than a rule that says it continues. */
        let take = section;
        if (section.length > room) {
          const cut = section.lastIndexOf("\n\n", room);
          if (cut < 120) { dropped = true; continue; }
          take = `${section.slice(0, cut).trim()}\n\n(…)`;
        }
        if (take.length < section.length) dropped = true;
        used += take.length;
        parts.push(take);
        if (!from.includes(d.name)) from.push(d.name);
      }
    }
    if (parts.length === 0) return null;

    return {
      from,
      text: parts.join("\n\n") +
        (dropped
          ? "\n\n(More rules than fit here. The documents are in the workspace under Documents.)"
          : ""),
    };
  } catch {
    return null;
  }
}
