// The single "brain" read/write path. context-pack (REST), mcp-server (MCP
// JSON-RPC tool calls), and remember (REST action for ChatGPT) all call the
// exact same functions here against the exact same `memory_items` table —
// which is *why* three different AI chats connected to the same Axon
// account see identical context: there is only ever one underlying store.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { embedAndStore, embedQuery } from "./embeddings.ts";
import { adapterKeyFromLabel, slugFromLabel } from "./adapters.ts";
import { openWorkForPack, standingRulesForPack } from "./workspace.ts";

const CHARS_PER_TOKEN = 4; // rough heuristic, good enough for budgeting

/**
 * Turn a project key a caller sent into the id it refers to.
 *
 * By key, not by id: a client should be able to say `"trading-os"` without
 * having looked anything up, and a key is stable in a way an id is not worth
 * asking a caller to carry. An unknown key resolves to null rather than
 * failing — a memory filed as general is a small loss, and refusing to store
 * somebody's thought because they mistyped a scope is a large one.
 */
export async function resolveProjectId(
  admin: SupabaseClient,
  userId: string,
  key: string | null | undefined,
): Promise<string | null> {
  if (!key || typeof key !== "string") return null;
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("key", key.trim().toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}

export async function buildContextPack(
  admin: SupabaseClient,
  userId: string,
  opts: {
    query?: string | null;
    tokenBudget?: number;
    apiKeyId?: string | null;
    /**
     * The name the calling client registered under, when there is one. Present
     * for every MCP/API caller and absent for the in-app preview — which is
     * the distinction that keeps the graph honest: looking at your own memory
     * in your own browser is not another app having read it.
     */
    clientLabel?: string | null;
    /**
     * Which project this recall is for. Omitted means everything, which is the
     * right default: an assistant that has not said what it is working on
     * should not be given a guess.
     */
    project?: string | null;
  } = {},
) {
  const query = opts.query?.trim() || null;
  /* Started here and awaited below, so it costs no wall-clock: it runs beside
     the block that follows rather than after it. Deliberately not inside that
     destructured Promise.all — this returns a shape rather than a Supabase
     result, and folding it in would make the array read as something it is
     not. */
  const openWork = openWorkForPack(admin, userId, opts.project);
  const rulesWork = standingRulesForPack(admin, userId, opts.project);
  // Resolved once. Null here means either "no project asked for" or "asked for
  // one that does not exist", and both should behave the same way: return
  // everything rather than silently return nothing.
  const projectId = await resolveProjectId(admin, userId, opts.project);
  const tokenBudget = Math.min(Math.max(opts.tokenBudget ?? 1500, 200), 8000);
  let charBudget = tokenBudget * CHARS_PER_TOKEN;

  const [
    { data: profile },
    { data: factRows },
    { data: sources },
    { data: planStatus },
    // When an assistant last wrote here, and how much has arrived since.
    // A memory layer that only ever receives is a search index over somebody's
    // exhaust; the half that makes it memory is the half a person or an
    // assistant puts there on purpose.
    { data: lastWrite },
    // Where work stands, as opposed to what is known. One row, overwritten.
    { data: threadRows },
    /* Notes the person wrote, most recent first.
     *
     * These are already in memory_items, so in principle the search finds them
     * — and in practice it never does, because they compete with seventeen
     * hundred commits and lose on every axis a search cares about. A note
     * somebody typed this morning and abandoned halfway is the single most
     * useful thing in this pack, and it was the least likely to survive the
     * budget.
     *
     * So they come out separately and always. Small enough not to matter, and
     * the reason a note is worth writing here rather than anywhere else: you
     * stop mid-sentence, go and do something, and the next assistant you open
     * can say it is there. */
    { data: noteRows },
  ] = await Promise.all([
    admin.from("profiles").select("full_name, role, use_case, plan_tier").eq("id", userId).maybeSingle(),
    // Distilled conclusions. Cheap enough to always include in full: a few
    // dozen short statements against a budget the raw items would otherwise
    // consume entirely.
    // Scoped, at last. A recall for one project used to return every
    // conclusion on the account — so asking about a trading terminal answered
    // with forty settled decisions about a different app, and an assistant has
    // no way to tell that they are not about the thing it is working on.
    // Null project means everywhere, so those always come along.
    (projectId
      ? admin
        .from("memory_facts")
        .select("statement, category, last_confirmed_at")
        .eq("user_id", userId)
        .is("superseded_at", null)
        .or(`project_id.eq.${projectId},project_id.is.null`)
        .order("last_confirmed_at", { ascending: false })
        .limit(60)
      : admin
        .from("memory_facts")
        .select("statement, category, last_confirmed_at")
        .eq("user_id", userId)
        .is("superseded_at", null)
        .order("last_confirmed_at", { ascending: false })
        .limit(60)),
    admin
      .from("source_connections")
      .select("provider, status, external_account_label, last_synced_at")
      .eq("user_id", userId),
    admin.from("user_plan_status").select("has_semantic_search").eq("user_id", userId).maybeSingle(),
    admin
      .from("memory_items")
      .select("created_at")
      .eq("user_id", userId)
      .eq("source_type", "manual")
      .order("created_at", { ascending: false })
      .limit(1),
    (projectId
      ? admin.from("project_threads").select("state, updated_by, updated_at")
          .eq("user_id", userId).eq("project_id", projectId)
      : admin.from("project_threads").select("state, updated_by, updated_at")
          .eq("user_id", userId).is("project_id", null)
    ).limit(1),
    admin
      .from("memory_items")
      .select("title, content, updated_at, occurred_at, metadata")
      .eq("user_id", userId)
      .eq("origin_key", "notes")
      .is("retired_at", null)
      .order("occurred_at", { ascending: false })
      .limit(4),
  ]);

  let items: any[] = [];
  let searchMode: "semantic" | "keyword" | "recency" = "recency";

  if (query && planStatus?.has_semantic_search) {
    // Real vector similarity search (Ultra/Lifetime tiers). Falls through to
    // keyword search below if embedding the query fails for any reason
    // (missing key, provider hiccup) — semantic search degrading to keyword
    // search is fine; silently returning nothing would not be.
    const queryVector = await embedQuery(admin, userId, query);
    if (queryVector) {
      const { data: matches } = await admin.rpc("match_memory_items", {
        p_user_id: userId,
        p_query_embedding: queryVector,
        p_match_count: 60,
        p_project_id: projectId,
      });
      if (matches && matches.length > 0) {
        items = matches;
        searchMode = "semantic";
      }
    }
  }

  if (items.length === 0) {
    // Typed loosely on purpose. The recency path is a table read and the
    // keyword path below is an RPC, and supabase-js gives those two different
    // builder types that do not unify — the shapes of what they RETURN are the
    // same, which is all this variable is for.
    // deno-lint-ignore no-explicit-any
    let itemsQuery: any = admin
      .from("memory_items")
      .select("id, content_type, title, content, entities, occurred_at, source_type")
      .eq("user_id", userId)
      // Retired memories are excluded from every recall path. The two search
      // RPCs filter it themselves; this is the recency path, which reads the
      // table directly.
      .is("retired_at", null)
      .order("occurred_at", { ascending: false })
      .limit(60);

    // This project, plus everything that belongs to no project — narrowed
    // further below, where material synced from a connected account and
    // belonging to no project is dropped. Notes and conclusions still travel:
    // they are true whichever app is open. A mailbox is not.
    if (projectId) {
      itemsQuery = itemsQuery.or(`project_id.eq.${projectId},project_id.is.null`);
    }

    if (query) {
      // Searches title + content + entities through the expression the GIN
      // index in 0001_init.sql actually covers. Searching the `content`
      // column alone missed every memory whose subject only appears in its
      // title — which is most of them.
      itemsQuery = admin.rpc("search_memory_items", {
        p_user_id: userId,
        p_query: query,
        p_limit: 60,
        p_project_id: projectId,
      });
      searchMode = "keyword";
    }

    const { data } = await itemsQuery;
    items = data ?? [];
  }

  /* What this assistant is not allowed to be handed.
   *
   * Applied here rather than inside the queries because there are three ways
   * items arrive — semantic, keyword and plain recency — and a filter written
   * three times is a filter that will disagree with itself. One place, after
   * the join, covers every path including any added later.
   *
   * Keyed on the adapter, so "never send my mail to Cursor" is one decision
   * rather than one per registration. An account with no rules loses nothing:
   * the lookup returns empty and every item passes.
   *
   * Filtered before includedIds is built, so a withheld memory is not recorded
   * as recalled — a refusal that still showed up in the read log would be
   * worse than no refusal at all.
   */
  /* Material pulled from a connected account, belonging to no project, does
   * not travel into a project-scoped recall.
   *
   * The rule above was written when the only unscoped things were notes and
   * conclusions about how somebody works — those are true whichever app is
   * open, and withholding them would make a scoped recall thinner for nothing.
   * A mailbox changes that. Thirty Outlook items arrived with no project, so a
   * recall scoped to `axon` handed an assistant a declined card notice, broker
   * statements and advertising. Perplexity said so itself the first time it
   * read this account.
   *
   * A conclusion about a person generalises. An email does not. So the test is
   * not "does it have a project" but "did it come from a connected account and
   * belong to no project" — notes, and anything an assistant wrote, still
   * travel as before.
   */
  if (projectId && items.length > 0) {
    const ids = items.map((i: { id?: string }) => i.id).filter(Boolean);
    if (ids.length > 0) {
      const { data: shape } = await admin
        .from("memory_items")
        .select("id, project_id, source_connection_id")
        .in("id", ids);
      const stray = new Set(
        (shape ?? [])
          .filter((r: { project_id: string | null; source_connection_id: string | null }) =>
            !r.project_id && !!r.source_connection_id)
          .map((r: { id: string }) => r.id),
      );
      if (stray.size > 0) {
        items = items.filter((i: { id?: string }) => !stray.has(i.id ?? ""));
      }
    }
  }

  const adapterKey = adapterKeyFromLabel(opts.clientLabel ?? "");
  if (adapterKey && adapterKey !== "other" && items.length > 0) {
    const { data: rules } = await admin
      .from("recall_rules")
      .select("source_type")
      .eq("user_id", userId)
      .eq("adapter_key", adapterKey);
    const denied = new Set((rules ?? []).map((r: { source_type: string }) => r.source_type));
    if (denied.size > 0) {
      items = items.filter((i: { source_type?: string }) => !denied.has(i.source_type ?? ""));
    }
  }

  const theList = await openWork;
  /* Awaited here rather than further down because the rules are paid for out
     of the same budget the items spend. Adding them on top would quietly grow
     every pack by a fifth, and the first thing an over-budget pack loses is a
     note — which is the one thing in here nobody else has a copy of. */
  const standingRules = await rulesWork;
  if (standingRules) charBudget = Math.max(200, charBudget - standingRules.text.length);

  const grouped: Record<string, unknown[]> = {};
  // The ids that actually went out, not the ids that were considered. An item
  // dropped for budget was never seen by the assistant, and recording it as
  // recalled would put a connection on the graph that did not happen.
  const includedIds: string[] = [];
  let used = 0;
  let included = 0;
  for (const item of items) {
    // Both guarded, where only the title was. content is NOT NULL in
    // memory_items so this cannot fire today — but items reach here from three
    // different paths (a table read and two RPCs), and a row arriving without
    // it would throw a TypeError inside the one function every assistant
    // calls, taking down every recall on the account rather than skipping one
    // row. The guard costs nothing on the hottest path in the product.
    const cost = (item.title?.length ?? 0) + (item.content?.length ?? 0);
    if (used + cost > charBudget) continue;
    used += cost;
    included += 1;
    if (item.id) includedIds.push(item.id);
    grouped[item.content_type] ??= [];
    grouped[item.content_type].push({
      title: item.title,
      content: item.content,
      source: item.source_type,
      occurred_at: item.occurred_at,
    });
  }

  const entitySet = new Set<string>();
  for (const item of items) {
    for (const e of item.entities ?? []) {
      if (typeof e === "string") entitySet.add(e);
    }
  }

  // Facts lead. An assistant opening cold needs "who is this and how do they
  // work" before it needs twenty commit messages, and until now the pack only
  // ever offered the second — which is why it read as search results rather
  // than as memory.
  /* A conclusion has to say how old it is.
   *
   * The date was already selected and already used to order these, and then
   * thrown away — so an assistant received forty settled statements with no
   * way to tell a decision made this morning from one made in June. Faced with
   * its own more recent impression it will trust itself, which is the shape in
   * which a shared memory quietly breaks.
   *
   * Only the ones old enough for it to matter. Stamping "confirmed today" on
   * everything is noise, and noise gets read past; a date that appears only
   * when something has been sitting a while is a date somebody notices. */
  const ageOf = (iso: string | null) => {
    if (!iso) return null;
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days < 7) return null;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  };

  const knownFacts: Record<string, string[]> = {};
  for (const f of factRows ?? []) {
    const age = ageOf(f.last_confirmed_at ?? null);
    (knownFacts[f.category] ??= []).push(
      age ? `${f.statement} (last confirmed ${age} ago)` : f.statement,
    );
  }

  const lastWrittenAt = lastWrite?.[0]?.created_at ?? null;
  const daysSinceWrite = lastWrittenAt
    ? Math.floor((Date.now() - new Date(lastWrittenAt).getTime()) / 86_400_000)
    : null;
  const nudge = lastWrittenAt === null
    ? "Nothing has ever been saved here on purpose. Everything this memory holds arrived from connected sources; no decision, preference or reason has been written by anyone. If this conversation settles something, save it."
    : (daysSinceWrite !== null && daysSinceWrite >= 3
        ? `Nothing has been saved here in ${daysSinceWrite} days, while sources kept arriving. If this conversation settles something, save it.`
        : null);

  const thread = threadRows?.[0] ?? null;
  const threadAgeHours = thread
    ? Math.round((Date.now() - new Date(thread.updated_at).getTime()) / 3_600_000)
    : null;

  const pack = {
    /**
     * Where this was left, and how long ago.
     *
     * First in the pack because it is the first thing a person wants on
     * opening: not what is known, but what was happening. The age travels with
     * it and is not decoration — a thread two hours old is a cursor, the same
     * sentence two weeks old is a claim about the present that has stopped
     * being true. The reader decides, which they can only do if they are told.
     */
    /* What the person wrote and did not finish. Deliberately verbatim and
       short: the assistant should be able to say "you started this" and quote
       it, not summarise something it half saw. */
    ...((noteRows ?? []).length ? {
      your_notes: (noteRows ?? []).map((n) => ({
        title: n.title ?? null,
        text: (n.content ?? "").slice(0, 400),
        about: n.metadata?.repo ?? n.metadata?.app ?? null,
        written_at: n.occurred_at,
      })),
    } : {}),
    /* Verbatim, and first. These are the things that are true before anything
       else in this pack is read — the ones that make a write fail silently or
       send somebody to the wrong checkout. A conclusion can be paraphrased;
       one of these cannot. */
    ...(standingRules ? { standing_rules: standingRules } : {}),
    /* Beside where_we_were on purpose. That says what the last session was in
       the middle of; this says what the account has been asked for. An
       assistant that plans without either is guessing, and until today it had
       no way not to — the list lived behind a tool call that an instruction at
       connect time was supposed to trigger, and measurably did not. */
    ...(theList ? { the_list: theList } : {}),
    ...(thread ? {
      where_we_were: {
        state: thread.state,
        updated_by: thread.updated_by ?? null,
        updated_at: thread.updated_at,
        hours_ago: threadAgeHours,
        ...(threadAgeHours !== null && threadAgeHours > 168
          ? { caution: "Over a week old. Treat as a starting point to confirm, not as the current state." }
          : {}),
      },
    } : {}),
    profile: {
      name: profile?.full_name ?? null,
      role: profile?.role ?? null,
      use_case: profile?.use_case ?? null,
      plan: profile?.plan_tier ?? "starter",
    },
    session_objective: query ?? "general context",
    connected_sources: (sources ?? []).map((s) => ({
      provider: s.provider,
      status: s.status,
      account: s.external_account_label,
      last_synced_at: s.last_synced_at,
    })),
    // What is true about this person, grouped by kind.
    known: knownFacts,
    entities: Array.from(entitySet).slice(0, 40),
    // What it was drawn from, and everything not yet distilled.
    memory: grouped,
    stats: {
      items_returned: included,
      approx_tokens: Math.round(used / CHARS_PER_TOKEN),
      token_budget: tokenBudget,
      search_mode: searchMode,
    },
    /**
     * What to do with this, said where an assistant will actually read it.
     *
     * The server already sends instructions at `initialize` and both tools
     * carry a description saying to call `remember` when something is worth
     * keeping. Measured against reality, that does not work: an assistant with
     * this connected for a full day of decisions called `remember` zero times
     * unprompted. One sentence at connect time competes with an entire system
     * prompt and a repository full of context, and "worth keeping" gives a
     * model no trigger it can recognise.
     *
     * A tool result is different. It arrives mid-task, in context, at the
     * moment the assistant is actually working — and it arrives again on every
     * recall rather than once. So the contract travels with the answer.
     *
     * Deliberately short and factual. This is the user's own server telling
     * assistants how to use it, not an attempt to talk a model into anything:
     * it names the triggers and stops.
     */
    how_to_use: {
      /**
       * A nudge that carries a fact, not a reminder of a rule.
       *
       * Every other line here is a standing instruction, and a standing
       * instruction is easy to read past — it says the same thing on the
       * hundredth recall as on the first. This one changes: it says how long it
       * has been since anything was written, and how much has arrived from the
       * user's sources in the meantime.
       *
       * That asymmetry is the actual failure mode. A memory layer fills itself
       * with commits and mail whether or not anyone participates, so it can look
       * healthy — hundreds of items, a growing map — while holding nothing
       * anybody decided. Naming the gap is the only honest way to say so.
       *
       * Silent when a write happened in the last three days. A nudge that always
       * fires is noise, and noise is read past faster than a rule.
       */
      ...(nudge ? { nudge } : {}),
      project: opts.project ?? null,
      save_with: opts.project
        ? `remember({ content, project: "${opts.project}" })`
        : "remember({ content, project })",
      save_when:
        "The user states a preference, settles a decision, corrects you, or " +
        "explains why something is done a particular way. Save the reason, not " +
        "the change — what changed is already in the commit.",
      do_not_save:
        "Progress reports, summaries of this conversation, or anything you are " +
        "not confident is true tomorrow.",
      shared_with:
        "Every assistant connected to this account, including the ones this " +
        "user has not opened yet.",
      /* The half of the contract that was never moved here. `remember` and
         `set_thread` have been repeated in every recall since the day an
         assistant was measured calling remember zero times unprompted; the
         build list kept living in the connect-time instruction, which is the
         place that measurement proved does not hold. */
      the_build_list:
        "This account keeps one build list and it is the record of what was " +
        "asked for. `the_list` above is the top of it, ordered by value over " +
        "effort — not a priority somebody wrote down. Call list_tasks for the " +
        "whole list before planning work. Tick mark_built from your own diff, " +
        "and mark_tested only from something you ran and read the output of: a " +
        "green build is not a test. Anything the person mentions in passing " +
        "goes to add_catch, even when it is not work yet.",
      keep_the_thread:
        "Call set_thread when this conversation reaches a natural stopping " +
        "point, or when what happens next changes. One or two sentences: what " +
        "is in flight, what is unverified, what comes next. It replaces the " +
        "previous line rather than adding to it, so write the current state and " +
        "not a history of it.",
    },
  };

  await admin.from("context_pack_logs").insert({
    user_id: userId,
    api_key_id: opts.apiKeyId ?? null,
    query,
    token_budget: tokenBudget,
    items_returned: included,
    // Delivered, not saved. This is what the assistant has to read; the saving
    // is real but lives in the searching that did not happen, which cannot be
    // measured from here.
    approx_tokens_delivered: Math.round(used / CHARS_PER_TOKEN),
  });

  await recordRecalls(admin, userId, includedIds, opts.clientLabel ?? null, opts.apiKeyId ?? null);

  return pack;
}

/**
 * Mark the items in a pack as having been read by the client that asked for it.
 *
 * Best-effort on purpose. The assistant already has its answer by the time this
 * runs, and a graph annotation is never worth failing a recall over — if the
 * table is not there yet, or the write loses a race, the pack still returns.
 */
async function recordRecalls(
  admin: SupabaseClient,
  userId: string,
  itemIds: string[],
  clientLabel: string | null,
  apiKeyId: string | null,
) {
  if (!clientLabel || itemIds.length === 0) return;
  try {
    const { error } = await admin.rpc("record_memory_recalls", {
      p_user_id: userId,
      p_item_ids: itemIds,
      p_client_key: adapterKeyFromLabel(clientLabel),
      p_client_label: clientLabel,
      p_api_key_id: apiKeyId,
    });
    if (error) console.error("recordRecalls failed", error.message);
  } catch (err) {
    console.error("recordRecalls threw", err);
  }
}

export async function rememberMemory(
  admin: SupabaseClient,
  userId: string,
  input: {
    content: string;
    title?: string | null;
    tags?: string[];
    /** null is a value the callers genuinely produce: sourceLabelFor returns
     *  it when nothing claimed a label and no OAuth client name was available.
     *  Every read below is falsy-guarded, so null and absent behave the same —
     *  the type said otherwise and both call sites were quietly wrong. */
    source_label?: string | null;
    /** Which project this is about. Omitted means it applies across all of them. */
    project?: string | null;
    /** The registered client doing the writing, so two of the same assistant
        can be told apart on the landscape. resolveBearerToken already knows
        it; before this it was thrown away. */
    api_key_id?: string | null;
  },
) {
  if (!input.content || !input.content.trim()) {
    throw new Error("content is required");
  }
  const row = {
    user_id: userId,
    project_id: await resolveProjectId(admin, userId, input.project),
    source_connection_id: null,
    source_type: "manual" as const,
    content_type: "note" as const,
    external_id: null,
    title: input.title?.trim() || null,
    content: input.content.trim(),
    entities: input.tags ?? [],
    metadata: input.source_label ? { remembered_via: input.source_label } : {},
    // Resolved once, here, where adapters.ts is already the authority. The
    // label stays in metadata because an unrecognised client should still be
    // nameable; the key is what the terrain and the facts view group by.
    // 'other' falls back to source_type, mirroring originKeyOfMemory on the
    // frontend, so an unknown client lands on the summit it was stored under
    // rather than on one nobody can see.
    // An app that says who it is keeps its own name.
    //
    // An unrecognised label used to collapse into "manual" together with
    // everything that sent no name at all, so a client could identify itself
    // perfectly and still be filed as anonymous. "manual" now means only what
    // it says: nothing told us where this came from.
    //
    // This is also what makes a private app private. A summit is drawn where
    // an account has memories, so somebody's own tool appears on their map and
    // on nobody else's — no allowlist to maintain and no per-user setting to
    // get wrong.
    origin_key: (() => {
      if (!input.source_label) return "manual";
      const key = adapterKeyFromLabel(input.source_label);
      if (key !== "other") return key;
      return slugFromLabel(input.source_label) ?? "manual";
    })(),
    api_key_id: input.api_key_id ?? null,
    occurred_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("memory_items").insert(row).select("id, created_at").single();
  if (error) throw new Error(error.message);

  // Best-effort — never let embedding failure block the save. The caller
  // already has their confirmation by the time this runs.
  embedAndStore(admin, userId, data.id, row.title, row.content).catch((err) =>
    console.error("rememberMemory: embedAndStore failed", err),
  );

  return data;
}

export async function listSourcesForUser(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("source_connections")
    .select("provider, status, external_account_label, last_synced_at")
    .eq("user_id", userId);
  return data ?? [];
}
