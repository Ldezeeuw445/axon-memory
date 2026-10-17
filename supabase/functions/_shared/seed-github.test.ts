// The first thing a stranger's GitHub connection does, under a test, because
// until now it had never run.
//
// D3: choosing no repositories gave no repositories chosen, so somebody
// connected GitHub and watched it do nothing. seedGithubRepositories is the
// answer, and it fires exactly once per account — on a first connection with
// nothing chosen. support@ picked its five by hand in August, before this
// existed, and no other account has connected GitHub since. So the only way
// this code has ever been judged is by reading it.
//
// The doubles below are the smallest thing that answers the questions the
// function asks: a count, a list of existing project keys, and two inserts.
// Everything they record is what the function decided, which is the only part
// worth asserting — Postgres does not need testing here.
//
// Run with:  npm run test:deno
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { seedGithubRepositories } from "./source-sync.ts";

type Row = Record<string, unknown>;

/** A Supabase client double, recording every insert it is handed. */
function fakeAdmin(opts: { repoCount?: number; projectKeys?: string[] } = {}) {
  const inserted: { table: string; row: Row }[] = [];
  let nextId = 1;

  const admin = {
    from(table: string) {
      return {
        // .select(..., { head: true }) → the count query
        select(_cols: string, o?: { count?: string; head?: boolean }) {
          if (o?.head) {
            const q = {
              eq: () => Promise.resolve({ count: opts.repoCount ?? 0 }),
            };
            return q;
          }
          // .select('key').eq('user_id', …) → existing project keys
          return {
            eq: () =>
              Promise.resolve({
                data: (opts.projectKeys ?? []).map((key) => ({ key })),
              }),
          };
        },
        insert(row: Row) {
          inserted.push({ table, row });
          const result = {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: `p${nextId++}` }, error: null }),
            }),
            then: (res: (v: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(res),
          };
          return result;
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { admin: admin as any, inserted };
}

/** GitHub, answering with whatever this test wants it to answer. */
function fakeGitHub(body: unknown, status = 200) {
  const real = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    )) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

const repo = (full_name: string, extra: Row = {}) => ({
  name: full_name.split("/")[1],
  full_name,
  default_branch: "main",
  ...extra,
});

Deno.test("a choice already made is never overwritten", async () => {
  // The whole reason this can run on reconnect without fear. If it ever
  // seeds over somebody's chosen repositories it has destroyed a decision,
  // and there is no undo for that anywhere in the product.
  const { admin, inserted } = fakeAdmin({ repoCount: 5 });
  const restore = fakeGitHub([repo("someone/anything")]);
  try {
    const out = await seedGithubRepositories(admin, "u1", "tok");
    assertEquals(out.created, 0);
    assertEquals(out.reason, "already chosen");
    assertEquals(inserted.length, 0, "it wrote something over a real choice");
  } finally {
    restore();
  }
});

Deno.test("each repository becomes one project, carrying its branch", async () => {
  const { admin, inserted } = fakeAdmin();
  const restore = fakeGitHub([
    repo("luka/axon-memory"),
    repo("luka/trading-os", { default_branch: "develop" }),
  ]);
  try {
    const out = await seedGithubRepositories(admin, "u1", "tok");
    assertEquals(out.created, 2);

    const projects = inserted.filter((i) => i.table === "projects");
    assertEquals(projects.map((p) => p.row.key), ["axon-memory", "trading-os"]);
    assertEquals(projects.map((p) => p.row.name), ["axon-memory", "trading-os"]);

    const repos = inserted.filter((i) => i.table === "project_repos");
    assertEquals(repos.map((r) => r.row.full_name), [
      "luka/axon-memory",
      "luka/trading-os",
    ]);
    // The branch matters: a project pointed at the wrong branch syncs a branch
    // nobody works on, which is how AXE CORE's main sat quiet for weeks.
    assertEquals(repos.map((r) => r.row.branch), ["main", "develop"]);
  } finally {
    restore();
  }
});

Deno.test("two repositories with the same name keep both, owner folded in", async () => {
  // Forking somebody's `docs` is ordinary. Losing one of the two silently is
  // not, and it would look exactly like the repository was never seen.
  const { admin, inserted } = fakeAdmin();
  const restore = fakeGitHub([repo("luka/docs"), repo("acme/docs")]);
  try {
    const out = await seedGithubRepositories(admin, "u1", "tok");
    assertEquals(out.created, 2);
    const keys = inserted
      .filter((i) => i.table === "projects")
      .map((p) => p.row.key);
    assertEquals(keys, ["docs", "acme-docs"]);
  } finally {
    restore();
  }
});

Deno.test("a key a project already has does not collide with it", async () => {
  // The count is on project_repos, so somebody who made a project by hand and
  // never chose a repository lands here with keys already taken.
  const { admin, inserted } = fakeAdmin({ projectKeys: ["docs"] });
  const restore = fakeGitHub([repo("luka/docs")]);
  try {
    await seedGithubRepositories(admin, "u1", "tok");
    const keys = inserted
      .filter((i) => i.table === "projects")
      .map((p) => p.row.key);
    assertEquals(keys, ["luka-docs"]);
  } finally {
    restore();
  }
});

Deno.test("a name that slugs to nothing is skipped, not inserted blank", async () => {
  // A key reaches a URL, a recall argument and an AGENTS.md line. An empty one
  // is a broken row in three places at once.
  const { admin, inserted } = fakeAdmin();
  const restore = fakeGitHub([repo("luka/---"), repo("luka/real")]);
  try {
    const out = await seedGithubRepositories(admin, "u1", "tok");
    assertEquals(out.created, 1);
    assertEquals(
      inserted.filter((i) => i.table === "projects").map((p) => p.row.key),
      ["real"],
    );
  } finally {
    restore();
  }
});

Deno.test("GitHub refusing is reported, not guessed around", async () => {
  const { admin, inserted } = fakeAdmin();
  const restore = fakeGitHub({ message: "Bad credentials" }, 401);
  try {
    const out = await seedGithubRepositories(admin, "u1", "tok");
    assertEquals(out.created, 0);
    assertEquals(out.reason, "github 401");
    assertEquals(inserted.length, 0);
  } finally {
    restore();
  }
});

Deno.test("an account with no repositories says so", async () => {
  const { admin, inserted } = fakeAdmin();
  const restore = fakeGitHub([]);
  try {
    const out = await seedGithubRepositories(admin, "u1", "tok");
    assertEquals(out.created, 0);
    assertEquals(out.reason, "no repositories");
    assertEquals(inserted.length, 0);
  } finally {
    restore();
  }
});

Deno.test("every seeded project gets a colour", async () => {
  // Colour is what ties a note, a summit and a repository to each other in the
  // interface. A project without one has no identity anywhere.
  const { admin, inserted } = fakeAdmin();
  const restore = fakeGitHub(
    ["a", "b", "c", "d"].map((n) => repo(`luka/${n}`)),
  );
  try {
    await seedGithubRepositories(admin, "u1", "tok");
    const colours = inserted
      .filter((i) => i.table === "projects")
      .map((p) => p.row.colour);
    assertEquals(colours.length, 4);
    for (const c of colours) assert(typeof c === "string" && c.length > 0);
  } finally {
    restore();
  }
});
