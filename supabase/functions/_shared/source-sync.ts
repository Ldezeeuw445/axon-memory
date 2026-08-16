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
const REPO_LIMIT = 10;
const COMMITS_PER_REPO = 10;
const GITHUB_MAX_ITEMS = 200;

export type MemoryDraft = {
  external_id: string;
  title: string;
  content: string;
  content_type: "email" | "commit" | "pull_request" | "issue" | "page" | "message";
  occurred_at: string;
  entities?: unknown[];
  metadata?: Record<string, unknown>;
};

export type SourceConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted?: string | null;
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

async function syncGmail(token: string): Promise<MemoryDraft[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${PAGE_SIZE}&q=in:inbox`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`gmail list failed: ${listRes.status}`);
  const { messages = [] } = await listRes.json();

  const drafts: MemoryDraft[] = [];
  for (const m of messages) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();
    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers ?? []) headers[h.name] = h.value;
    drafts.push({
      external_id: m.id,
      title: headers["Subject"] || "(no subject)",
      content: `${headers["Subject"] ?? ""}\n\nFrom: ${headers["From"] ?? "unknown"}\n\n${msg.snippet ?? ""}`,
      content_type: "email",
      occurred_at: headers["Date"] ? new Date(headers["Date"]).toISOString() : new Date().toISOString(),
      metadata: { from: headers["From"] },
    });
  }
  return drafts;
}

async function syncGithub(token: string): Promise<MemoryDraft[]> {
  const gh = (path: string) =>
    fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "axon-memory",
        Accept: "application/vnd.github+json",
      },
    });

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
  const reposRes = await gh(`/user/repos?sort=pushed&per_page=${REPO_LIMIT}&affiliation=owner,collaborator,organization_member`);
  if (reposRes.ok) {
    const repos = await reposRes.json();
    for (const repo of repos) {
      push({
        external_id: `repo-${repo.id}`,
        title: repo.full_name,
        content: [repo.description, repo.language && `Language: ${repo.language}`, repo.private ? "Private" : "Public"]
          .filter(Boolean).join("\n"),
        content_type: "issue",
        occurred_at: repo.pushed_at ?? repo.updated_at ?? new Date().toISOString(),
        metadata: { repo: repo.full_name, url: repo.html_url, stars: repo.stargazers_count },
      });

      const commitsRes = await gh(`/repos/${repo.full_name}/commits?author=${me.login}&per_page=${COMMITS_PER_REPO}`);
      if (!commitsRes.ok) continue;
      const commits = await commitsRes.json();
      if (!Array.isArray(commits)) continue;
      for (const c of commits) {
        const msg = c.commit?.message ?? "";
        push({
          external_id: c.sha,
          title: `${repo.full_name}: ${msg.split("\n")[0]}`,
          content: msg,
          content_type: "commit",
          occurred_at: c.commit?.author?.date ?? repo.pushed_at ?? new Date().toISOString(),
          metadata: { repo: repo.full_name, url: c.html_url },
        });
      }
    }
  }

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

  return drafts.slice(0, GITHUB_MAX_ITEMS);
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
  if (!res.ok) throw new Error(`notion search failed: ${res.status}`);
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

async function syncSlack(token: string): Promise<MemoryDraft[]> {
  const chRes = await fetch(
    "https://slack.com/api/conversations.list?limit=5&types=public_channel,private_channel",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const chData = await chRes.json();
  if (!chData.ok) throw new Error(`slack conversations.list failed: ${chData.error}`);

  const drafts: MemoryDraft[] = [];
  for (const ch of chData.channels ?? []) {
    const hRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${ch.id}&limit=${Math.floor(PAGE_SIZE / (chData.channels.length || 1))}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const hData = await hRes.json();
    if (!hData.ok) continue;
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

    const run = async (t: string): Promise<MemoryDraft[]> => {
      if (conn.provider === "gmail") return await syncGmail(t);
      if (conn.provider === "github") return await syncGithub(t);
      if (conn.provider === "notion") return await syncNotion(t);
      if (conn.provider === "slack") return await syncSlack(t);
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
      accessToken = await refreshAccessToken(conn.provider, refreshToken);
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
        content_type: d.content_type,
        external_id: d.external_id,
        title: d.title,
        content: d.content,
        entities: d.entities ?? [],
        metadata: d.metadata ?? {},
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
        await Promise.allSettled(
          inserted.map((row: { id: string; title: string | null; content: string }) =>
            embedAndStore(admin, conn.user_id, row.id, row.title, row.content),
          ),
        );
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
    await admin
      .from("source_connections")
      .update({ status: "error", last_error: message })
      .eq("id", conn.id);
    return { ok: false, error: message };
  }
}
