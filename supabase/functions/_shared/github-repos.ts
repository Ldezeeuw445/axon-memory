/**
 * A8-3: choosing which GitHub repositories AXON reads.
 *
 * `project_repos` is the choice: one row per repository, each pointing at the
 * project it is about. The sync reads only these rows, and an account that has
 * synced before and has none fails with "no repositories chosen" — which two
 * live connections did for weeks because there was no screen to choose on.
 *
 * The plan is computed here, pure, so it can be tested without GitHub or a
 * database: what to add, what to stop reading, and which project key a new
 * repository gets. Stopping never deletes anything: the project and every
 * memory already kept from that repository stay, only future reads stop.
 */

/** Matches the sync's budget: 600 items split with at least 60 per repository. */
export const MAX_CHOSEN_REPOS = 10;

export type GithubRepo = {
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string | null;
  pushed_at: string | null;
  description: string | null;
};

const FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export function isRepoFullName(s: unknown): s is string {
  return typeof s === "string" && FULL_NAME.test(s);
}

/** GitHub's repo object, reduced to what the picker needs. Nothing else leaves. */
export function toGithubRepo(r: any): GithubRepo | null {
  if (!r || !isRepoFullName(r.full_name)) return null;
  return {
    full_name: r.full_name,
    name: typeof r.name === "string" ? r.name : r.full_name.split("/")[1],
    private: !!r.private,
    default_branch: typeof r.default_branch === "string" ? r.default_branch : null,
    pushed_at: typeof r.pushed_at === "string" ? r.pushed_at : null,
    description: typeof r.description === "string" ? r.description.slice(0, 200) : null,
  };
}

/** A project key the projects table will accept (^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$), unique among `taken`. */
export function projectKeyFor(fullName: string, taken: Set<string>): string | null {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const trim = (s: string) => s.slice(0, 40).replace(/-+$/g, "");
  const [owner = "", name = ""] = fullName.split("/");
  const candidates = [trim(slug(name)), trim(`${slug(owner)}-${slug(name)}`)];
  for (const c of candidates) {
    if (c.length >= 2 && /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(c) && !taken.has(c)) return c;
  }
  const base = trim(slug(name)).slice(0, 36).replace(/-+$/g, "") || "repo";
  for (let i = 2; i < 100; i++) {
    const c = `${base}-${i}`;
    if (/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(c) && !taken.has(c)) return c;
  }
  return null;
}

export type ChoicePlan = { add: string[]; stop: string[]; keep: string[] };

/**
 * What changes when the person's choice is `wanted` and the stored one is
 * `current`. Only repositories GitHub actually lists for this token may be
 * added, so a client cannot point the sync at a repository it cannot read.
 */
export function planChoice(
  wanted: string[],
  current: string[],
  available: Set<string>,
): ChoicePlan | { error: string } {
  const uniq = [...new Set(wanted)];
  if (uniq.some((w) => !isRepoFullName(w))) return { error: "every repository must be owner/name" };
  if (uniq.length > MAX_CHOSEN_REPOS) return { error: `choose at most ${MAX_CHOSEN_REPOS} repositories` };
  const cur = new Set(current);
  const add = uniq.filter((w) => !cur.has(w));
  const missing = add.filter((w) => !available.has(w));
  if (missing.length) return { error: `not readable with this connection: ${missing.join(", ")}` };
  const want = new Set(uniq);
  return { add, stop: current.filter((c) => !want.has(c)), keep: current.filter((c) => want.has(c)) };
}
