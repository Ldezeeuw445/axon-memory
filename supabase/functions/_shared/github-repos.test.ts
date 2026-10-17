import { assertEquals } from "jsr:@std/assert@1";
import { MAX_CHOSEN_REPOS, isRepoFullName, planChoice, projectKeyFor, toGithubRepo } from "./github-repos.ts";

Deno.test("github repos: full names are validated", () => {
  assertEquals(isRepoFullName("Ldezeeuw445/axon-memory"), true);
  assertEquals(isRepoFullName("a/b.c_d-e"), true);
  for (const bad of ["", "noslash", "a/b/c", "../x", "a/ b", "a/b?x=1", 5, null]) assertEquals(isRepoFullName(bad), false);
});

Deno.test("github repos: GitHub objects are reduced; junk is dropped", () => {
  const r = toGithubRepo({ full_name: "o/r", name: "r", private: 1, default_branch: "main", pushed_at: "2026-10-01T00:00:00Z", owner: { secret: 1 }, description: "x".repeat(500) });
  assertEquals(r?.private, true);
  assertEquals(r?.description?.length, 200);
  assertEquals(Object.keys(r!).sort(), ["default_branch", "description", "full_name", "name", "private", "pushed_at"]);
  assertEquals(toGithubRepo({ full_name: "bad" }), null);
  assertEquals(toGithubRepo(null), null);
});

Deno.test("github repos: project keys satisfy the table check and never collide", () => {
  const re = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
  const taken = new Set<string>(["axon-memory"]);
  const a = projectKeyFor("Ldezeeuw445/axon-memory", taken)!;
  assertEquals(a, "ldezeeuw445-axon-memory");
  assertEquals(projectKeyFor("o/Hello_World", new Set()), "hello-world");
  assertEquals(projectKeyFor("o/x", new Set()), "o-x"); // one char is too short for the check
  const long = projectKeyFor("o/" + "a".repeat(80), new Set())!;
  assertEquals(re.test(long), true);
  const t2 = new Set(["dup", "o-dup"]);
  assertEquals(projectKeyFor("o/dup", t2), "dup-2");
  assertEquals(re.test(projectKeyFor("o/---", new Set())!), true);
});

Deno.test("github repos: plan adds, stops and keeps; never adds what GitHub does not list", () => {
  const avail = new Set(["o/a", "o/b", "o/c"]);
  assertEquals(planChoice(["o/a", "o/b", "o/a"], ["o/b", "o/z"], avail), { add: ["o/a"], stop: ["o/z"], keep: ["o/b"] });
  assertEquals("error" in planChoice(["o/x"], [], avail), true);
  assertEquals("error" in planChoice(["bad"], [], avail), true);
  const many = Array.from({ length: MAX_CHOSEN_REPOS + 1 }, (_, i) => `o/r${i}`);
  assertEquals("error" in planChoice(many, [], new Set(many)), true);
  // Keeping a repository GitHub no longer lists is fine: only additions are checked.
  assertEquals(planChoice(["o/z"], ["o/z"], avail), { add: [], stop: [], keep: ["o/z"] });
  assertEquals(planChoice([], ["o/a"], avail), { add: [], stop: ["o/a"], keep: [] });
});
