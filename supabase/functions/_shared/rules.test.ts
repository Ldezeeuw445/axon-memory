// The two rules on the Deno side that have each already cost somebody
// something, now under a test that can actually run.
//
// Everything with real money or real damage behind it lives on this side of
// the repository — the recall path, the distiller, the rate limit, the
// machine-mail filter, the title rule — and until Deno was installed none of
// it could be tested at all. A green Vite build says nothing about any of it;
// these functions are only ever exercised by deploying them.
//
// Run with:  npm run test:deno
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isMachineMail } from "./source-sync.ts";
import { cleanTitle } from "./workspace.ts";

/* ── The machine-mail filter (D6) ───────────────────────────────────────
 *
 * The first outside account connected Gmail and its entire memory became
 * twenty-four Google and OpenAI sign-in notices. An assistant asked about her
 * then reported back what it had learned: that she signs in to things.
 *
 * The filter reads the LOCAL PART only, deliberately. A company whose domain
 * is alerts.example.com still employs people who write to you, and dropping
 * their mail is a worse failure than keeping a notice — one is a silent loss
 * of somebody's actual correspondence, the other is noise they can see.
 */

Deno.test("machine senders are dropped, in any language", () => {
  // These were the real ones. The subjects were Dutch and the next account's
  // will not be, which is exactly why the rule is on the sender.
  for (const from of [
    "no-reply@accounts.google.com",
    "noreply@tm.openai.com",
    "notifications@github.com",
    "do-not-reply@stripe.com",
    "donotreply@example.com",
    "mailer-daemon@googlemail.com",
    "postmaster@example.com",
    "bounces@sendgrid.net",
    "alerts@monitoring.example.com",
    "Google <no-reply@accounts.google.com>",
  ]) {
    assert(isMachineMail(from), `should have been dropped: ${from}`);
  }
});

Deno.test("people are kept, including at companies with alarming domains", () => {
  for (const from of [
    "daphne@example.com",
    "Luka de Zeeuw <luka@axeheadquarters.com>",
    // The one this rule is most likely to get wrong: a human being whose
    // employer put "alerts" in the domain.
    "sarah@alerts.example.com",
    "support@example.com",
    "billing@example.com",
    "hello@example.com",
  ]) {
    assertEquals(isMachineMail(from), false, `should have been kept: ${from}`);
  }
});

Deno.test("a missing or malformed sender is kept rather than dropped", () => {
  // A header that cannot be parsed is not evidence of a machine, and the
  // failure direction matters: dropping somebody's mail because a header was
  // odd is a loss they cannot see.
  assertEquals(isMachineMail(null), false);
  assertEquals(isMachineMail(undefined), false);
  assertEquals(isMachineMail(""), false);
  assertEquals(isMachineMail("not an address"), false);
});

Deno.test("noreply as part of a word is not a machine sender", () => {
  // The boundary characters in the pattern are the whole point: without them
  // a person called "Arnoreply" or a team called "denoreply" is silently lost.
  assertEquals(isMachineMail("arnoreplyman@example.com"), false);
  assertEquals(isMachineMail("unalerted@example.com"), false);
});

/* ── The title rule (W9) ────────────────────────────────────────────────
 *
 * A whole pasted request went in as a task title and was cut off mid-word by
 * a slice(0,200). The list is the one place a line has to be readable by
 * somebody else a week later, so the rule refuses rather than truncates —
 * and offers a title back rather than inventing one, because writing a title
 * out of somebody's paragraph is guessing what they meant.
 */

Deno.test("an ordinary title passes through", () => {
  const out = cleanTitle("Distil during the first sync");
  assert("title" in out);
  assertEquals(out.title, "Distil during the first sync");
});

Deno.test("whitespace is collapsed, so a pasted line is not a shape", () => {
  const out = cleanTitle("  Read images   and\n\nPDFs  ");
  assert("title" in out);
  assertEquals(out.title, "Read images and PDFs");
});

Deno.test("an empty title is refused, not accepted as blank", () => {
  const out = cleanTitle("   \n  ");
  assert("error" in out);
  assert(out.error.includes("needs a title"));
});

Deno.test("the boundary is 120, and it is not off by one", () => {
  assert("title" in cleanTitle("a".repeat(120)));
  assert("error" in cleanTitle("a".repeat(121)));
});

Deno.test("a pasted request is refused with a usable title offered back", () => {
  // The exact shape that caused this: a whole request, no full stop until
  // late, arriving where a title belongs.
  const paste =
    "i want to review the full architecture of axe core visually explained to me based on truth only. " +
    "I want to see everything in detail every model connected, how its connect what the model does";
  const out = cleanTitle(paste);
  assert("error" in out);
  // It says how long, so the caller can see what happened.
  assert(out.error.includes(String(paste.length)));
  // And it offers the first sentence, whole — never cut mid-word, which is the
  // one outcome that should not exist.
  assert(out.error.includes("truth only"));
  const offered = out.error.split('"')[1] ?? "";
  // A prefix of what was pasted, ending where the input ends a word. Checking
  // "ends on a letter" would be the wrong test: a complete word does that too.
  assert(paste.startsWith(offered), "the offered title must come from the paste");
  assert(!/\w/.test(paste.charAt(offered.length)), "cut mid-word");
});

Deno.test("a long title with no sentence end is offered back on a word boundary", () => {
  const run = "connect every source and assistant and repository and project and workspace ".repeat(3);
  const out = cleanTitle(run);
  assert("error" in out);
  const offered = out.error.split('"')[1] ?? "";
  assert(offered.length > 0 && offered.length <= 120);
  // The offered title must end on a whole word.
  assert(!offered.endsWith(" "));
  assert(run.startsWith(offered));
});
