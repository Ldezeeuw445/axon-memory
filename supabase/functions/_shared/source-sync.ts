// Shared provider-sync logic — pulls the most recent items from a connected
// source and upserts them as memory_items. Used by BOTH:
//   - sync-source (user clicks "Sync now" in the app)
//   - cron-sync-sources (scheduled pg_cron job, runs automatically)
// Keeping this in one place means "manual sync" and "automatic sync" can
// never drift apart or duplicate/dedupe differently.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "./crypto.ts";
import { PROVIDERS } from "./providers.ts";
import { embedAndStore } from "./embeddings.ts";

const PAGE_SIZE = 20;
// GitHub is the one source where a single page is far too small: a repository
// list plus its recent commits is the point, not a slice of it.
// A first sync reaches back far enough to be worth having: a hundred commits
// per repository, which for this founder's four repos is most of a year. Later
// syncs ask for the gap since the last one and almost always fit in one page.
const COMMITS_PER_PAGE = 100;
const FIRST_SYNC_PAGES = 5;
/**
 * How much one run may take from GitHub, and why there is a limit at all.
 *
 * Every inserted item is embedded before the run finishes, so the ceiling is
 * not GitHub's patience but this function's: a thousand rows means a thousand
 * concurrent calls to the embedding API, and that fails in ways that are hard
 * to read.
 *
 * It used to be a flat slice of the first 200 drafts, applied after every
 * repository had been fetched. That is first-come-first-served, and the order
 * is the order the repositories happen to be listed — so on the first real run
 * two repositories took the whole budget and the other three got nothing, with
 * `slice` saying nothing about it. Two projects looked empty and the connection
 * reported success.
 *
 * Split evenly instead, and say when a repository was cut short. A budget that
 * silently favours whoever went first is worse than a smaller one that is fair
 * and admits its edges.
 */
const GITHUB_BUDGET = 600;
const GITHUB_MIN_PER_REPO = 60;
/**
 * How much older history one run may collect per repository.
 *
 * Separate from the budget above, and smaller. The forward half of a sync is
 * usually a handful of commits; the backward half would happily run for an hour
 * if allowed. A hundred a run, every half hour, walks a year of a busy
 * repository in an afternoon and never makes a scheduled run expensive.
 */
const GITHUB_BACKFILL_PER_RUN = 100;

export type MemoryDraft = {
  external_id: string;
  title: string;
  content: string;
  content_type: "email" | "commit" | "pull_request" | "issue" | "page" | "message";
  occurred_at: string;
  entities?: unknown[];
  metadata?: Record<string, unknown>;
  /**
   * Which project this memory is about, when the source knows. Null means it
   * is not about one — a mailbox, a Slack channel — and null is the answer
   * every source except GitHub gives.
   */
  project_id?: string | null;
};

/** owner/name -> what to sync from it, and how far back it has already been read. */
export type RepoMap = Map<string, {
  projectId: string;
  branch: string | null;
  /** Oldest commit reached so far. Null means the walk has not started. */
  backfillUntil: string | null;
  /** True once GitHub has said there is nothing older. */
  backfillDone: boolean;
}>;

export type SourceConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted?: string | null;
  /** When this connection last completed. Null means it has never run, which
   *  is what tells the GitHub sync to reach back rather than ask for the gap. */
  last_synced_at?: string | null;
};

/**
 * Google's access tokens last about an hour. The refresh token was stored at
 * connect time and then never used, so every Gmail sync after the first one
 * failed with a 401, flipped the connection to "error", and made a perfectly
 * good connection render as if it had never been made.
 */
function isAuthFailure(message: string): boolean {
  return /\b401\b|\b403\b|invalid_auth|invalid_credentials|token_expired|not_authed/i.test(message);
}

async function refreshAccessToken(provider: string, refreshToken: string): Promise<string> {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`no provider config for ${provider}`);

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    throw new Error(`refresh failed for ${provider}: ${json?.error ?? res.status}`);
  }
  return json.access_token as string;
}


/**
 * The reason inside a Google error, without the rest of it.
 *
 * Google returns { error: { code, message, errors: [{ reason }] } }. Only the
 * reason and the message are taken: the body can carry the request and the
 * account it was made for, and none of that belongs in a column somebody reads
 * to find out why their mail stopped syncing.
 */
async function googleReason(res: Response): Promise<string | null> {
  try {
    const body = await res.json();
    const err = body?.error;
    const reason = err?.errors?.[0]?.reason ?? err?.status ?? null;
    const message = typeof err?.message === "string" ? err.message.slice(0, 90) : null;
    return [reason, message].filter(Boolean).join(": ") || null;
  } catch {
    return null;
  }
}

/**
 * Mail a machine sent, which is not a memory.
 *
 * On the first outside account, 24 of 25 memories were email and the feed read:
 * "Daphne, controleer de instellingen", "Beveiligingsmelding" three times, "Je
 * hebt een deel van je Google-account...", "New sign-in to your OpenAI
 * account". Three conclusions were distilled out of that, so what an assistant
 * would report back as knowing about her was Google and OpenAI telling her she
 * had signed in.
 *
 * Matched on the sender, not the subject. Those subjects were Dutch and the
 * next account's will not be — a phrase list breaks on the first person who
 * does not write in English, while no-reply@accounts.google.com sends the same
 * alert in every language there is.
 *
 * Deliberately narrow. This drops mail from an address that announces itself as
 * unattended; it does not try to judge whether a human's message was worth
 * keeping. Nothing is deleted either — the message is still in the mailbox, it
 * simply does not become memory.
 */
const MACHINE_SENDER =
  /(^|[.\-_+])(no?[.\-_]?reply|donotreply|do[.\-_]not[.\-_]reply|notifications?|alerts?|mailer[.\-_]?daemon|postmaster|bounces?|automated|auto[.\-_]?confirm)([.\-_+]|$)/i;

export function isMachineMail(from: string | null | undefined): boolean {
  if (!from) return false;
  const at = from.lastIndexOf("@");
  if (at < 0) return false;
  // The local part only. A domain called "alerts.example.com" belongs to a
  // company that may well employ people who write to you.
  const angle = from.lastIndexOf("<", at);
  const local = from.slice(angle >= 0 ? angle + 1 : 0, at);
  return MACHINE_SENDER.test(local);
}

async function syncGmail(token: string): Promise<MemoryDraft[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${PAGE_SIZE}&q=in:inbox`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  // Google says why, in a body we were throwing away. "403" alone sends you
  // looking at the token; the reason is usually somewhere else entirely —
  // accessNotConfigured means the Gmail API is off in the Cloud project,
  // insufficientPermissions means the grant is missing the scope. Two different
  // afternoons, one status code.
  if (!listRes.ok) {
    const reason = await googleReason(listRes);
    throw new Error(`gmail list failed: ${listRes.status}${reason ? ` (${reason})` : ""}`);
  }
  const { messages = [] } = await listRes.json();

  const drafts: MemoryDraft[] = [];
  let skipped = 0;
  for (const m of messages) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();
    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers ?? []) headers[h.name] = h.value;
    if (isMachineMail(headers["From"])) { skipped += 1; continue; }
    drafts.push({
      external_id: m.id,
      title: headers["Subject"] || "(no subject)",
      content: `${headers["Subject"] ?? ""}\n\nFrom: ${headers["From"] ?? "unknown"}\n\n${msg.snippet ?? ""}`,
      content_type: "email",
      occurred_at: headers["Date"] ? new Date(headers["Date"]).toISOString() : new Date().toISOString(),
      metadata: { from: headers["From"] },
    });
  }
  // Counted, not silent. A sync that quietly returns four of twenty-five is the
  // same shape as the bug that made Slack look empty for a day. Numbers only —
  // a subject line is somebody's mail and a log is the wrong place for it.
  if (skipped) console.log(`gmail: ${skipped} of ${messages.length} were machine mail`);
  return drafts;
}

/**
 * Outlook / Microsoft 365 mail, through Graph.
 *
 * Deliberately the same shape as syncGmail: subject, sender and preview, never
 * the full body. A memory layer that quietly copies every word of every email
 * into a second database is a thing people are right to refuse, and the
 * preview is what makes a message findable later anyway.
 */
async function syncOutlook(token: string): Promise<MemoryDraft[]> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages` +
      `?$top=${PAGE_SIZE}&$select=id,subject,from,bodyPreview,receivedDateTime&$orderby=receivedDateTime desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw await failed("outlook", res);
  const { value = [] } = await res.json();

  // The same door as Gmail's. Both mailboxes, both filling a new account with
  // its own sign-in notices otherwise.
  let skipped = 0;
  const drafts = value
    .map((m: Record<string, any>) => {
      const from = m.from?.emailAddress
        ? `${m.from.emailAddress.name ?? ""} <${m.from.emailAddress.address ?? ""}>`.trim()
        : "unknown";
      return { m, from };
    })
    .filter(({ from }: { from: string }) => {
      if (!isMachineMail(from)) return true;
      skipped += 1;
      return false;
    })
    .map(({ m, from }: { m: Record<string, any>; from: string }) => ({
      external_id: m.id,
      title: m.subject || "(no subject)",
      content: `${m.subject ?? ""}\n\nFrom: ${from}\n\n${m.bodyPreview ?? ""}`,
      content_type: "email" as const,
      occurred_at: m.receivedDateTime ?? new Date().toISOString(),
      metadata: { from },
    }));
  if (skipped) console.log(`outlook: ${skipped} of ${value.length} were machine mail`);
  return drafts;
}

/**
 * Google Drive: what documents exist and what they are about.
 *
 * Only Docs are exported to text — a spreadsheet flattened to prose is noise,
 * and a binary is worse. Everything else is recorded by name and place, which
 * is enough for an assistant to know the file exists and ask for it.
 */
async function syncGoogleDrive(token: string): Promise<MemoryDraft[]> {
  const params = new URLSearchParams({
    pageSize: String(PAGE_SIZE),
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))",
    q: "trashed = false",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await failed("google drive", res);
  const { files = [] } = await res.json();

  const drafts: MemoryDraft[] = [];
  for (const f of files) {
    let body = "";
    if (f.mimeType === "application/vnd.google-apps.document") {
      const ex = await fetch(
        `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // A whole document can be a hundred thousand characters, which would eat
      // a recall budget on its own. The opening is what says what it is.
      if (ex.ok) body = (await ex.text()).slice(0, 4000);
    }
    drafts.push({
      external_id: f.id,
      title: f.name || "(untitled)",
      content: body
        ? `${f.name}\n\n${body}`
        : `${f.name}\n\n${f.mimeType}${f.owners?.[0]?.displayName ? ` — owned by ${f.owners[0].displayName}` : ""}`,
      content_type: "page",
      occurred_at: f.modifiedTime ?? new Date().toISOString(),
      metadata: { mime_type: f.mimeType, link: f.webViewLink },
    });
  }
  return drafts;
}

/**
 * Supabase: the shape of what you are building.
 *
 * Not rows — never rows. What an assistant opening cold needs is which
 * projects exist, in which region, and what the tables are called; that is the
 * context you would otherwise paste into every session. The data inside those
 * tables is the user's own business and stays where it is.
 */
async function syncSupabase(token: string): Promise<MemoryDraft[]> {
  const res = await fetch("https://api.supabase.com/v1/projects", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await failed("supabase", res);
  const projects = await res.json();

  const drafts: MemoryDraft[] = [];
  for (const p of Array.isArray(projects) ? projects.slice(0, PAGE_SIZE) : []) {
    let tables = "";
    try {
      // Read-only introspection through the Management API's SQL endpoint.
      // Names and columns only.
      const r = await fetch(`https://api.supabase.com/v1/projects/${p.id}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "select table_name, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as cols " +
            "from information_schema.columns where table_schema = 'public' group by table_name order by table_name",
        }),
      });
      if (r.ok) {
        const rows = await r.json();
        tables = (Array.isArray(rows) ? rows : [])
          .map((t: Record<string, string>) => `- ${t.table_name}(${t.cols})`)
          .join("\n")
          .slice(0, 6000);
      }
    } catch {
      // A project whose API is unreachable still belongs in the memory as a
      // project; losing the whole row over a missing schema would be worse.
    }
    drafts.push({
      external_id: p.id,
      title: `Supabase project: ${p.name}`,
      content: `Project ${p.name} (ref ${p.id}) in ${p.region}.` + (tables ? `\n\nPublic schema:\n${tables}` : ""),
      content_type: "page",
      occurred_at: p.created_at ?? new Date().toISOString(),
      metadata: { project_ref: p.id, region: p.region },
    });
  }
  return drafts;
}

/**
 * A first connection, with something to sync.
 *
 * Choosing repositories is the right model — naming one also says what it is
 * about, so a memory arrives already knowing its project. But it cannot be the
 * *first* thing somebody does. They connected GitHub and got a source in error
 * saying "no repositories chosen", which reads as having broken the thing they
 * just set up.
 *
 * So the account starts with one project per repository. That is not a guess
 * about what matters: it is true for most people, it is visible on the terrain
 * within the minute, and merging two projects afterwards is a smaller act than
 * naming five from an empty screen. Capped at eight of the most recently
 * pushed, because somebody with two hundred repositories does not want two
 * hundred projects, and the ninth is a decision rather than a default.
 *
 * Runs only when nothing has been chosen at all, so it can never overwrite a
 * choice, and re-connecting a source does not quietly re-seed it.
 */
export async function seedGithubRepositories(
  admin: SupabaseClient,
  userId: string,
  token: string,
): Promise<{ created: number; reason?: string }> {
  const { count } = await admin
    .from("project_repos")
    .select("full_name", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return { created: 0, reason: "already chosen" };

  const res = await fetch(
    "https://api.github.com/user/repos?sort=pushed&per_page=8&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "axon-memory",
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!res.ok) return { created: 0, reason: `github ${res.status}` };
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) return { created: 0, reason: "no repositories" };

  const { data: existing } = await admin
    .from("projects").select("key").eq("user_id", userId);
  const taken = new Set((existing ?? []).map((p: { key: string }) => p.key));

  let created = 0;
  for (const repo of list) {
    const name: string = repo?.name ?? "";
    const fullName: string = repo?.full_name ?? "";
    if (!name || !fullName) continue;

    /* The key reaches a URL, a recall argument and an AGENTS.md line, so it is
       slugged hard rather than trusted. Two repositories called the same thing
       under different owners get the owner folded in rather than one silently
       winning. */
    let key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    if (!key) continue;
    if (taken.has(key)) {
      const owner = (fullName.split("/")[0] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      key = `${owner}-${key}`.slice(0, 40);
      if (taken.has(key)) continue;
    }
    taken.add(key);

    const { data: project, error } = await admin
      .from("projects")
      .insert({ user_id: userId, key, name, colour: SEED_COLOURS[created % SEED_COLOURS.length] })
      .select("id")
      .single();
    if (error || !project) continue;

    await admin.from("project_repos").insert({
      user_id: userId,
      full_name: fullName,
      branch: repo?.default_branch ?? null,
      project_id: project.id,
    });
    created += 1;
  }
  return { created };
}

/* The same matte set the map uses. A seeded project that arrives in a colour
   nothing else on the terrain wears would announce itself as machine-made. */
const SEED_COLOURS = [
  "#e0b45e", "#ed905e", "#a9c46c", "#69c27e",
  "#5ec2b0", "#63b4d8", "#8aa8e8", "#b195e8",
];

/**
 * GitHub, scoped to the repositories the account actually chose.
 *
 * ## Which repositories
 *
 * It used to ask for the ten most recently pushed and take whatever came back.
 * That is a guess, and it is wrong in both directions: it picks up an
 * afternoon's experiment and misses the repo somebody has not touched this week
 * and thinks about every day. `project_repos` is the answer to both — the user
 * names the repositories, and naming one also says what it is about, so the
 * memory arrives already knowing which project it belongs to.
 *
 * An account with no repositories chosen syncs nothing and says so, rather than
 * quietly filling up with whatever GitHub happened to list first.
 *
 * ## How far back
 *
 * The first sync walks pages until it reaches the horizon; every sync after it
 * asks only for commits since the last one. Before this it took the ten newest
 * per repo and never paged, so anything older than those ten was unreachable
 * forever — no amount of re-syncing would ever surface it. For a memory layer
 * whose entire pitch is "no more cold start", starting with ten commits and no
 * way back is the wrong first impression.
 */
/**
 * A repository's own AGENTS.md, read from the repository.
 *
 * The standing layer used to be text somebody pasted into workspace_docs, and a
 * pasted rule goes stale: DEEL 0 said "the only real one is the kilo worktree"
 * and kept saying it long after that stopped being true. GitHub is connected
 * and these repositories already sync, so the file is already within reach —
 * editing it in the repository is what should update AXON.
 *
 * Written here rather than returned as a draft, because the ordinary path
 * upserts with ignoreDuplicates: a commit never changes and a document is the
 * one thing that does. This one overwrites on purpose.
 *
 * Stored as a memory item under origin_key `standing` rather than in
 * workspace_docs, which has one row per workspace and a check constraint on the
 * name — this account has five repositories with an AGENTS.md each and one
 * workspace, and they collide. As an item it is also searchable and distillable
 * like everything else, which the pasted copy never was.
 */
async function syncRepoDoc(
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  fullName: string,
  branch: string | null,
  projectId: string | null,
  gh: (path: string) => Promise<Response>,
): Promise<boolean> {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const res = await gh(`/repos/${fullName}/contents/AGENTS.md${ref}`);
  if (!res.ok) return false;             // most repositories have none, and that is fine
  const file = await res.json();
  if (file?.encoding !== "base64" || typeof file.content !== "string") return false;

  let text: string;
  try {
    text = new TextDecoder().decode(
      Uint8Array.from(atob(file.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
    );
  } catch {
    return false;
  }
  if (!text.trim()) return false;

  const { error } = await admin.from("memory_items").upsert({
    user_id: userId,
    source_connection_id: connectionId,
    source_type: "github",
    origin_key: "standing",
    content_type: "page",
    external_id: `agents-md:${fullName}`,
    title: `${fullName} · AGENTS.md`,
    content: text.slice(0, 40_000),
    project_id: projectId,
    entities: [],
    metadata: { repo: fullName, doc: "AGENTS.md", branch: branch ?? null, sha: file.sha ?? null },
    occurred_at: new Date().toISOString(),
  }, { onConflict: "user_id,source_connection_id,external_id" });
  return !error;
}

async function syncGithub(
  token: string,
  repos: RepoMap,
  since: string | null,
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<MemoryDraft[]> {
  const gh = (path: string) =>
    fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "axon-memory",
        Accept: "application/vnd.github+json",
      },
    });

  if (repos.size === 0) {
    /* Never synced means the account has only just connected and the seeding
       either has not run or found nothing. That is an empty first minute, not a
       fault, and marking the connection broken for it tells somebody they did
       something wrong on the one screen where they did everything right.
       An account that HAS synced and now has nothing chosen really did remove
       them, and there the error is the honest answer. */
    if (since === null) return [];
    throw new Error(
      "github: no repositories chosen. Pick which repos to sync and which project each belongs to.",
    );
  }

  const meRes = await gh("/user");
  if (!meRes.ok) throw new Error(`github /user failed: ${meRes.status}`);
  const me = await meRes.json();

  const drafts: MemoryDraft[] = [];
  const seen = new Set<string>();
  const push = (d: MemoryDraft) => {
    if (seen.has(d.external_id)) return;
    seen.add(d.external_id);
    drafts.push(d);
  };

  // The events feed alone was the whole GitHub sync, and it is a poor source
  // of memory: it only covers recent activity, drops anything older than about
  // 90 days, and returns almost nothing for someone whose work sits in private
  // repos. It stays for pull requests and issues, but the repositories
  // themselves are now the primary source.
  // What each repository actually gave back. Written down rather than inferred,
  // because the first run of this taught the lesson again: two of five repos
  // came back empty and the code had skipped them with a bare `break`, so
  // nothing anywhere could say whether they were forbidden, misnamed, or simply
  // held no commits by this author. Exactly the failure the Slack sync had.
  const report: string[] = [];
  const perRepo = Math.max(GITHUB_MIN_PER_REPO, Math.floor(GITHUB_BUDGET / repos.size));

  let docs = 0;
  for (const [fullName, { projectId, branch, backfillUntil, backfillDone }] of repos) {
    let got = 0;
    const repoRes = await gh(`/repos/${fullName}`);
    if (!repoRes.ok) {
      // 404 here is usually an organisation that has not approved the OAuth
      // app, not a typo — GitHub hides what you may not see rather than
      // refusing it.
      report.push(`${fullName}: repo unreadable (${repoRes.status})`);
      continue;
    }
    if (repoRes.ok) {
      const repo = await repoRes.json();
      // The repository's own standing layer, on every sync, so editing the file
      // is what updates AXON. Counted in the report because a document that
      // silently stopped arriving is exactly the failure this replaces.
      if (await syncRepoDoc(admin, userId, connectionId, fullName, branch, projectId, gh)) docs += 1;
      push({
        external_id: `repo-${repo.id}`,
        title: repo.full_name,
        content: [repo.description, repo.language && `Language: ${repo.language}`, repo.private ? "Private" : "Public"]
          .filter(Boolean).join("\n"),
        content_type: "issue",
        occurred_at: repo.pushed_at ?? repo.updated_at ?? new Date().toISOString(),
        metadata: { repo: repo.full_name, url: repo.html_url, stars: repo.stargazers_count },
        project_id: projectId,
      });
    }

    // First sync walks back; later ones ask only for what is new. `since` is
    // the previous run's timestamp, so the window is exactly the gap and the
    // page walk stops on its own once GitHub runs out.
    const pages = since ? 1 : FIRST_SYNC_PAGES;
    const sinceParam = since ? `&since=${encodeURIComponent(since)}` : "";
    // `sha` takes a branch name as well as a commit. Omitted, GitHub answers
    // with the default branch — right for a finished repo, wrong for one where
    // the work is happening somewhere else.
    const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : "";
    for (let page = 1; page <= pages; page++) {
      const commitsRes = await gh(
        `/repos/${fullName}/commits?author=${me.login}&per_page=${COMMITS_PER_PAGE}&page=${page}${sinceParam}${branchParam}`,
      );
      if (!commitsRes.ok) {
        report.push(`${fullName}: commits failed (${commitsRes.status})`);
        break;
      }
      const commits = await commitsRes.json();
      if (!Array.isArray(commits) || commits.length === 0) break;
      got += commits.length;
      for (const c of commits) {
        if (got > perRepo) break;
        const msg = c.commit?.message ?? "";
        push({
          external_id: c.sha,
          title: `${fullName}: ${msg.split("\n")[0]}`,
          content: msg,
          content_type: "commit",
          occurred_at: c.commit?.author?.date ?? new Date().toISOString(),
          // The branch travels with the memory: two branches of one repo are two
        // different stories, and a commit that says which it came from can be
        // told apart later without guessing from dates.
        metadata: { repo: fullName, branch: branch ?? null, url: c.html_url },
          project_id: projectId,
        });
      }
      // A short page is the last page. Asking for the next one would cost a
      // round trip to be told the same thing.
      if (commits.length < COMMITS_PER_PAGE) break;
      if (got > perRepo) break;
    }

    // ---- backwards, into whatever the forward pass could not afford --------
    //
    // Only once the repository has been read forwards at least once, and only
    // while GitHub still has something older. `until` is exclusive of nothing,
    // so the oldest commit already seen comes back again and dedupes on its sha
    // — cheaper than tracking an offset that pagination would invalidate.
    if (since && !backfillDone) {
      let oldest = backfillUntil;
      let filled = 0;
      let exhausted = false;

      for (let page = 1; page <= 2 && filled < GITHUB_BACKFILL_PER_RUN; page++) {
        const untilParam = oldest ? `&until=${encodeURIComponent(oldest)}` : "";
        const backRes = await gh(
          `/repos/${fullName}/commits?author=${me.login}&per_page=${COMMITS_PER_PAGE}&page=${page}${untilParam}${branchParam}`,
        );
        if (!backRes.ok) break;
        const older = await backRes.json();
        if (!Array.isArray(older) || older.length === 0) { exhausted = true; break; }

        for (const c of older) {
          const msg = c.commit?.message ?? "";
          const at = c.commit?.author?.date ?? null;
          push({
            external_id: c.sha,
            title: `${fullName}: ${msg.split("\n")[0]}`,
            content: msg,
            content_type: "commit",
            occurred_at: at ?? new Date().toISOString(),
            metadata: { repo: fullName, branch: branch ?? null, url: c.html_url },
            project_id: projectId,
          });
          filled += 1;
          // The walk is only as far back as the oldest thing actually taken.
          if (at && (!oldest || at < oldest)) oldest = at;
        }
        // A short page is GitHub saying there is nothing older.
        if (older.length < COMMITS_PER_PAGE) { exhausted = true; break; }
      }

      if (filled > 0 || exhausted) {
        await admin
          .from("project_repos")
          .update({ backfill_until: oldest, backfill_done: exhausted })
          .eq("user_id", userId)
          .eq("full_name", fullName);
        report.push(
          exhausted
            ? `${fullName}: +${filled} older (complete)`
            : `${fullName}: +${filled} older (back to ${String(oldest).slice(0, 10)})`,
        );
      }
    }

    if (got === 0) {
      // Reachable and empty. Almost always the author filter: a repository
      // whose commits were made under another identity — a work email, an
      // agent's account — has plenty of history and none of it is "yours".
      report.push(`${fullName}: 0 commits by ${me.login}${branch ? ` on ${branch}` : ""}`);
    } else if (got > perRepo) {
      // Said out loud on purpose. A repository that has more history than one
      // run may take should look truncated, not finished.
      report.push(`${fullName}: ${got} (cut at ${perRepo})`);
    } else {
      report.push(`${fullName}: ${got}`);
    }
  }

  // Counts and repository names only. Commit messages are somebody's work and a
  // log line is the wrong place for them.
  // Named in the report, because a standing document that quietly stopped
  // arriving is the same failure as a source that quietly returns zero — and
  // that one cost a day.
  console.log(`github: ${report.join(" | ")}${docs ? ` | ${docs} AGENTS.md` : " | no AGENTS.md found"}`);

  const evRes = await gh(`/users/${me.login}/events?per_page=${PAGE_SIZE}`);
  if (evRes.ok) {
    const events = await evRes.json();
    for (const ev of Array.isArray(events) ? events : []) {
      if (ev.type === "PushEvent") {
        for (const c of ev.payload?.commits ?? []) {
          push({
            external_id: c.sha,
            title: `${ev.repo?.name}: ${c.message?.split("\n")[0]}`,
            content: c.message ?? "",
            content_type: "commit",
            occurred_at: ev.created_at,
            metadata: { repo: ev.repo?.name },
          });
        }
      } else if (ev.type === "PullRequestEvent") {
        const pr = ev.payload?.pull_request;
        push({
          external_id: `pr-${pr?.id}`,
          title: `${ev.repo?.name} PR #${pr?.number}: ${pr?.title}`,
          content: pr?.body ?? "",
          content_type: "pull_request",
          occurred_at: ev.created_at,
          metadata: { repo: ev.repo?.name, url: pr?.html_url },
        });
      } else if (ev.type === "IssuesEvent") {
        const issue = ev.payload?.issue;
        push({
          external_id: `issue-${issue?.id}`,
          title: `${ev.repo?.name} #${issue?.number}: ${issue?.title}`,
          content: issue?.body ?? "",
          content_type: "issue",
          occurred_at: ev.created_at,
          metadata: { repo: ev.repo?.name, url: issue?.html_url },
        });
      }
    }
  }

  // No slice here any more. The budget is spent per repository above, where it
  // can be shared out and reported; cutting the combined list at the end is
  // what made three projects disappear without a word.
  return drafts;
}

/**
 * Linear speaks GraphQL, so one request brings back issues with the fields that
 * make them worth remembering — state, team, assignee, and the description.
 *
 * Ordered by last update rather than creation: an issue someone is still moving
 * is more use to an assistant than an old one that happens to be newer on the
 * clock.
 */
async function syncLinear(token: string): Promise<MemoryDraft[]> {
  const query = `
    query RecentIssues($first: Int!) {
      issues(first: $first, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          url
          updatedAt
          priorityLabel
          state { name type }
          team { key name }
          assignee { displayName }
          labels(first: 5) { nodes { name } }
        }
      }
    }`;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      // Linear takes the OAuth token bare, without a Bearer prefix.
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { first: PAGE_SIZE * 2 } }),
  });
  if (!res.ok) throw await failed("linear", res);

  const json = await res.json();
  // GraphQL answers 200 with an errors array, so a failure here looks like
  // success unless it is checked for explicitly.
  if (json?.errors?.length) {
    throw new Error(`linear: ${json.errors[0]?.message ?? "graphql error"}`);
  }

  const nodes = json?.data?.issues?.nodes ?? [];
  return nodes.map((n: Record<string, any>) => {
    const labels = (n.labels?.nodes ?? []).map((l: { name: string }) => l.name);
    const parts = [
      n.description,
      n.state?.name && `Status: ${n.state.name}`,
      n.assignee?.displayName && `Assigned to: ${n.assignee.displayName}`,
      n.priorityLabel && `Priority: ${n.priorityLabel}`,
      labels.length && `Labels: ${labels.join(", ")}`,
    ].filter(Boolean);

    return {
      external_id: n.id,
      title: `${n.identifier}: ${n.title}`,
      content: parts.join("\n"),
      content_type: "issue" as const,
      occurred_at: n.updatedAt ?? new Date().toISOString(),
      entities: labels,
      metadata: {
        url: n.url,
        team: n.team?.key,
        state: n.state?.name,
        state_type: n.state?.type,
      },
    };
  });
}

/* What the provider actually said, not just the number it said it with.
 *
 * Every one of these threw `<provider> failed: 401` and stored that in
 * last_error, which the Connections tab shows. A number tells you a sync broke
 * and nothing about which of the four or five reasons it was — a revoked
 * token, an integration removed from a workspace, a scope never granted, a
 * rate limit. Notion has been sitting in error with last_synced_at null and
 * the only record of why is a status code.
 *
 * Providers answer failures with JSON carrying their own message (Notion:
 * {code, message}; Google: {error:{message}}; Linear: {errors:[{message}]}),
 * so the sentence is already on the wire and was being thrown away. Truncated,
 * because this ends up in a column and then in a tooltip.
 */
async function failed(provider: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = await res.text();
    const j = JSON.parse(body);
    detail = j?.message ?? j?.error?.message ?? j?.error_description
      ?? j?.errors?.[0]?.message ?? j?.error ?? body;
  } catch {
    detail = "";
  }
  detail = String(detail ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  return new Error(detail
    ? `${provider} failed (${res.status}): ${detail}`
    : `${provider} failed: ${res.status}`);
}

async function syncNotion(token: string): Promise<MemoryDraft[]> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: PAGE_SIZE,
    }),
  });
  if (!res.ok) throw await failed("notion", res);
  const { results = [] } = await res.json();

  return results.map((page: any) => {
    const titleProp = Object.values(page.properties ?? {}).find(
      (p: any) => p.type === "title",
    ) as any;
    const title = titleProp?.title?.map((t: any) => t.plain_text).join("") || "Untitled";
    return {
      external_id: page.id,
      title,
      content: `${title}\n\n${page.url ?? ""}`,
      content_type: "page",
      occurred_at: page.last_edited_time ?? new Date().toISOString(),
      metadata: { url: page.url },
    } as MemoryDraft;
  });
}

/**
 * Slack, and why an empty result has to explain itself.
 *
 * A channel whose history could not be read used to be skipped with a bare
 * `continue`. Slack answers 200 with `{ok: false, error: "not_in_channel"}`
 * for the ordinary case of an app that has been installed but not invited
 * anywhere, and for a token missing `channels:history` — so every channel
 * would fail, the loop would finish, and the sync would report success with
 * nothing to show. This account synced Slack cleanly all day and holds zero
 * Slack memories; nothing anywhere said why, which is how it stayed that way.
 *
 * Two changes. The reasons are collected instead of dropped, and if every
 * channel refused, that is raised as the failure it is. An account with no
 * channels, or channels that are genuinely empty, still returns nothing
 * quietly — that is a true empty, and the difference between the two is the
 * entire point.
 *
 * Counts and Slack's own error codes are logged, never a channel name and
 * never message text. This function reads somebody's conversations, and a log
 * line is the last place any of that belongs.
 */
async function syncSlack(token: string): Promise<MemoryDraft[]> {
  const chRes = await fetch(
    "https://slack.com/api/conversations.list?limit=5&types=public_channel,private_channel",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const chData = await chRes.json();
  if (!chData.ok) throw new Error(`slack conversations.list failed: ${chData.error}`);

  const channels = chData.channels ?? [];
  const refused: string[] = [];
  const drafts: MemoryDraft[] = [];
  for (const ch of channels) {
    const hRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${ch.id}&limit=${Math.floor(PAGE_SIZE / (channels.length || 1))}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const hData = await hRes.json();
    if (!hData.ok) {
      refused.push(String(hData.error ?? "unknown"));
      continue;
    }
    for (const msg of hData.messages ?? []) {
      if (!msg.text) continue;
      drafts.push({
        external_id: `${ch.id}-${msg.ts}`,
        title: `#${ch.name}`,
        content: msg.text,
        content_type: "message",
        occurred_at: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        metadata: { channel: ch.name },
      });
    }
  }

  console.log(
    `slack: ${channels.length} channels, ${refused.length} refused, ${drafts.length} messages`,
  );

  // Every channel refused. That is a permissions or membership problem, not an
  // empty workspace, and it has to reach last_error rather than pass for a
  // clean run.
  if (channels.length > 0 && refused.length === channels.length) {
    const why = [...new Set(refused)].join(", ");
    throw new Error(
      `slack: could not read any of ${channels.length} channels (${why}). ` +
      `Invite the AXON app to a channel, or reconnect to grant channels:history.`,
    );
  }

  return drafts.slice(0, PAGE_SIZE);
}

/**
 * Syncs a single source_connections row: decrypts its token, pulls fresh
 * items from the provider, upserts them into memory_items (deduped on
 * user_id+source_connection_id+external_id), and updates the connection's
 * status/last_synced_at/last_error. Used by both the manual "Sync now"
 * button and the automatic cron job — identical behavior either way.
 */
export async function syncOneConnection(
  admin: SupabaseClient,
  conn: SourceConnectionRow,
): Promise<{ ok: true; fetched: number; synced: number } | { ok: false; error: string }> {
  try {
    let accessToken = await decryptToken(conn.access_token_encrypted ?? "");
    let drafts: MemoryDraft[] = [];
    // Counted separately from drafts: "how many the provider gave us" and "how
    // many are now actually in the database" are different questions, and
    // collapsing them is what hid this failure.
    let stored = 0;

    // Which repositories this account chose, and what each is about. Loaded
    // once per connection rather than per page, and only for the provider that
    // has any use for it.
    let repoMap: RepoMap = new Map();
    if (conn.provider === "github") {
      const { data: mapped } = await admin
        .from("project_repos")
        .select("full_name, project_id, branch, backfill_until, backfill_done")
        .eq("user_id", conn.user_id);
      repoMap = new Map(
        (mapped ?? []).map((r) => [r.full_name, {
          projectId: r.project_id,
          branch: r.branch ?? null,
          backfillUntil: r.backfill_until ?? null,
          backfillDone: !!r.backfill_done,
        }]),
      );
    }

    const run = async (t: string): Promise<MemoryDraft[]> => {
      if (conn.provider === "gmail") return await syncGmail(t);
      if (conn.provider === "github") return await syncGithub(t, repoMap, conn.last_synced_at ?? null, admin, conn.user_id, conn.id);
      if (conn.provider === "notion") return await syncNotion(t);
      if (conn.provider === "slack") return await syncSlack(t);
      if (conn.provider === "linear") return await syncLinear(t);
      if (conn.provider === "outlook") return await syncOutlook(t);
      if (conn.provider === "google_drive") return await syncGoogleDrive(t);
      if (conn.provider === "supabase") return await syncSupabase(t);
      return [];
    };

    try {
      drafts = await run(accessToken);
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      // One retry, and only for the case a refresh can actually fix. Anything
      // else — a revoked grant, a missing scope — must still surface as an
      // error rather than be retried into a confusing second failure.
      if (!isAuthFailure(message) || !conn.refresh_token_encrypted) throw err;

      const refreshToken = await decryptToken(conn.refresh_token_encrypted);
      /* Both, or the second failure hides the first.
         A sync refused for lack of permission looks like an expired token from
         here, so the retry runs, the refresh fails too, and the only thing
         recorded is "refresh failed" — which sends whoever reads it looking at
         tokens when the grant simply was not given. */
      try {
        accessToken = await refreshAccessToken(conn.provider, refreshToken);
      } catch (refreshErr) {
        const why = String(refreshErr instanceof Error ? refreshErr.message : refreshErr);
        throw new Error(`${message} — and the retry could not refresh either: ${why}`);
      }
      await admin
        .from("source_connections")
        .update({ access_token_encrypted: await encryptToken(accessToken) })
        .eq("id", conn.id);
      drafts = await run(accessToken);
    }

    if (drafts.length > 0) {
      const rows = drafts.map((d) => ({
        user_id: conn.user_id,
        source_connection_id: conn.id,
        source_type: conn.provider,
        // A synced item's origin is simply its provider — no label to resolve.
        origin_key: conn.provider,
        content_type: d.content_type,
        external_id: d.external_id,
        title: d.title,
        content: d.content,
        entities: d.entities ?? [],
        metadata: d.metadata ?? {},
        // Null for everything that is not about one project — a mailbox, a
        // Slack channel — which is every source but GitHub today.
        project_id: d.project_id ?? null,
        occurred_at: d.occurred_at,
      }));
      // ignoreDuplicates -> INSERT ... ON CONFLICT DO NOTHING. With .select(),
      // Postgres only returns the rows it actually inserted, so `inserted`
      // here is exactly "what's genuinely new this sync" — already-seen items
      // are silently skipped and never re-embedded.
      const { data: inserted, error: upsertErr } = await admin
        .from("memory_items")
        .upsert(rows, { onConflict: "user_id,source_connection_id,external_id", ignoreDuplicates: true })
        .select("id, title, content");

      // This error used to be discarded. A failed write left `inserted` null,
      // embedded nothing, and still reported ok with synced = drafts.length —
      // so a sync that stored zero items announced itself as a success and
      // cleared last_error on the way out. Undiagnosable from the outside.
      if (upsertErr) throw new Error(`memory_items upsert failed: ${upsertErr.message}`);

      stored = inserted?.length ?? 0;

      if (inserted && inserted.length > 0) {
        // Best-effort, same as manual remember: a failed embedding never
        // blocks the sync or loses the underlying memory item.
        // In batches, not all at once. A first sync can insert several hundred
        // rows, and one Promise.allSettled over all of them opens that many
        // concurrent connections to the embedding API — which does not fail
        // cleanly, it fails as a handful of timeouts and a run that looks like
        // it worked. Twenty at a time keeps the same total work inside limits
        // that are meant to be hit.
        const EMBED_BATCH = 20;
        for (let i = 0; i < inserted.length; i += EMBED_BATCH) {
          await Promise.allSettled(
            inserted.slice(i, i + EMBED_BATCH).map(
              (row: { id: string; title: string | null; content: string }) =>
                embedAndStore(admin, conn.user_id, row.id, row.title, row.content),
            ),
          );
        }
      }
    }

    await admin
      .from("source_connections")
      .update({ status: "connected", last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", conn.id);

    return { ok: true, fetched: drafts.length, synced: stored };
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    console.error(`syncOneConnection error [${conn.provider} / ${conn.id}]`, message);
    const wasHealthy = conn.status !== "error";
    await admin
      .from("source_connections")
      .update({ status: "error", last_error: message })
      .eq("id", conn.id);

    /* A distiller failure has raised an alert since August; a sync failure only
       ever wrote a column, so a source could stop bringing anything in and the
       first anybody heard of it was noticing the number had gone flat. Two
       connections on this account sat in `error` for days that way.
       Only on the way in. A connection already in error would raise one on
       every scheduled run, and an alert that arrives hourly is one nobody
       reads — which is the same silence, wearing a bell.
       The user id travels in metadata and the material never does: an alert
       ends up in Slack, and nothing about somebody's memories belongs there. */
    if (wasHealthy) {
      try {
        await admin.from("system_alerts").insert({
          alert_type: "sync_failed",
          message: `${conn.provider} stopped syncing for one account: ${message}`,
          metadata: { user_id: conn.user_id, provider: conn.provider, connection_id: conn.id },
        });
      } catch (alertErr) {
        console.error("sync: could not raise alert", alertErr);
      }
    }
    return { ok: false, error: message };
  }
}
