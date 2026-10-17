// GET  /functions/v1/github-repos?connection_id=<uuid>
//   -> { repos: GithubRepo[], chosen: [{ full_name, project_id, project_name }], max }
// POST /functions/v1/github-repos  body: { connection_id, repos: string[] }
//   -> { added, stopped, kept, chosen }
//
// A8-3: the screen where a person chooses which repositories AXON reads.
// The list comes from GitHub with the connection's own token (decrypted here,
// never returned). The choice is written with the caller's own JWT, so RLS on
// projects/project_repos is the guard, not this code. Stopping a repository
// removes only its project_repos row: the project and every memory already
// kept from it stay.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { decryptToken } from "../_shared/crypto.ts";
import { SEED_COLOURS } from "../_shared/source-sync.ts";
import { MAX_CHOSEN_REPOS, planChoice, projectKeyFor, toGithubRepo, type GithubRepo } from "../_shared/github-repos.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listRepos(token: string): Promise<{ repos: GithubRepo[] } | { status: number }> {
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?sort=pushed&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "axon-memory", Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return { status: res.status };
    const list = await res.json();
    if (!Array.isArray(list)) break;
    for (const r of list) { const g = toGithubRepo(r); if (g) repos.push(g); }
    if (list.length < 100) break;
  }
  return { repos };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && req.method !== "POST") return jsonResponse({ error: "GET or POST" }, { status: 405, origin });

  const auth = await getUserFromRequest(req);
  if (!auth) return jsonResponse({ error: "Unauthorized" }, { status: 401, origin });
  const userId = auth.user.id;

  const body = req.method === "POST" ? await req.json().catch(() => null) : null;
  const connectionId = req.method === "GET" ? new URL(req.url).searchParams.get("connection_id") : body?.connection_id;
  if (!connectionId || !UUID.test(connectionId)) return jsonResponse({ error: "connection_id must be a uuid" }, { status: 400, origin });
  if (req.method === "POST" && !Array.isArray(body?.repos)) return jsonResponse({ error: "repos must be an array of owner/name" }, { status: 400, origin });

  const admin = supabaseAdmin();
  const { data: conn } = await admin
    .from("source_connections")
    .select("id, provider, status, access_token_encrypted")
    .eq("id", connectionId).eq("user_id", userId).maybeSingle();
  if (!conn || conn.provider !== "github") return jsonResponse({ error: "GitHub connection not found" }, { status: 404, origin });
  if (conn.status === "disconnected" || !conn.access_token_encrypted) {
    return jsonResponse({ error: "reconnect", detail: "This GitHub connection is disconnected. Reconnect it first." }, { status: 409, origin });
  }

  // The caller's own client: every write below is checked by RLS as this user.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const chosenNow = async () => {
    const { data } = await db.from("project_repos").select("full_name, project_id, projects(name)").eq("user_id", userId).order("created_at");
    return (data ?? []).map((r: any) => ({ full_name: r.full_name, project_id: r.project_id, project_name: r.projects?.name ?? null }));
  };

  let token: string;
  try { token = await decryptToken(conn.access_token_encrypted); } catch {
    return jsonResponse({ error: "reconnect", detail: "AXON could not open this connection's access. Reconnect it." }, { status: 409, origin });
  }
  const listed = await listRepos(token);
  if ("status" in listed) {
    const reconnect = listed.status === 401 || listed.status === 403;
    return jsonResponse(
      { error: reconnect ? "reconnect" : "github_unavailable", detail: reconnect ? "GitHub no longer accepts this connection. Reconnect it." : `GitHub answered ${listed.status}.` },
      { status: reconnect ? 409 : 502, origin },
    );
  }

  if (req.method === "GET") {
    return jsonResponse({ repos: listed.repos, chosen: await chosenNow(), max: MAX_CHOSEN_REPOS }, { origin });
  }

  const current = await chosenNow();
  const plan = planChoice(body.repos, current.map((c) => c.full_name), new Set(listed.repos.map((r) => r.full_name)));
  if ("error" in plan) return jsonResponse({ error: "invalid", detail: plan.error }, { status: 400, origin });

  const { data: projects } = await db.from("projects").select("id, key, name").eq("user_id", userId);
  const taken = new Set((projects ?? []).map((p: any) => p.key));
  const byName = new Map((projects ?? []).map((p: any) => [String(p.name).toLowerCase(), p.id]));
  const repoInfo = new Map(listed.repos.map((r) => [r.full_name, r]));

  const added: string[] = [];
  const failed: string[] = [];
  for (const [i, full] of plan.add.entries()) {
    const info = repoInfo.get(full)!;
    // A project already named after the repository is the same idea; reuse it
    // rather than making a near-duplicate next to it on the terrain.
    let projectId = byName.get(info.name.toLowerCase()) as string | undefined;
    if (!projectId) {
      const key = projectKeyFor(full, taken);
      if (!key) { failed.push(full); continue; }
      const { data: p, error } = await db.from("projects")
        .insert({ user_id: userId, key, name: info.name, colour: SEED_COLOURS[(taken.size + i) % SEED_COLOURS.length] })
        .select("id").single();
      if (error || !p) { failed.push(full); continue; }
      taken.add(key);
      projectId = p.id;
    }
    const { error } = await db.from("project_repos").insert({ user_id: userId, full_name: full, branch: info.default_branch, project_id: projectId });
    if (error) failed.push(full); else added.push(full);
  }
  const stopped: string[] = [];
  if (plan.stop.length) {
    const { error } = await db.from("project_repos").delete().eq("user_id", userId).in("full_name", plan.stop);
    if (!error) stopped.push(...plan.stop); else failed.push(...plan.stop);
  }
  return jsonResponse(
    { added, stopped, kept: plan.keep, failed, chosen: await chosenNow() },
    { status: failed.length ? 207 : 200, origin },
  );
});
