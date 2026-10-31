// node --test scripts/check-lexicon.test.mjs
//
// The Lexicon guard is a release-gate step (scripts/release-gate.sh), so what
// it fails to look at matters as much as what it flags. These tests pin the
// extractor: every string on a line is scanned, code that merely contains a
// banned word is not copy, and the escape hatch still works.
import test from "node:test";
import assert from "node:assert/strict";
import { hitIn, hitsIn, isCode, proseOf, stringLiterals } from "./check-lexicon.mjs";

const words = (src) => hitsIn(src).map((h) => h.word.toLowerCase());

test("every string on a line is scanned, not just the first", () => {
  // Regression: a global quote-pair regex matched the "', { body: '" between
  // the two literals and consumed the opening quote of the second, so this
  // copy was never looked at.
  assert.deepEqual(stringLiterals(`callFunction('x', { body: 'We imported your folders' })`),
    ["x", "We imported your folders"]);
  assert.deepEqual(words(`      const r = callFunction('x', { body: 'We imported your folders' });`),
    ["imported"]);
});

test("a column list for .select() is not prose", () => {
  const line = `        page('memory_facts', 'id, statement, category, source_item_ids, project_id'),`;
  assert.deepEqual(stringLiterals(line), ["memory_facts", "id, statement, category, source_item_ids, project_id"]);
  assert.ok(isCode("id, statement, category, source_item_ids, project_id"));
  assert.deepEqual(hitsIn(line), []);
});

test("an import line is code, on its own or inside a printed sample", () => {
  assert.deepEqual(hitsIn(`import { Axon } from './packages/sdk-ts';`), []);
  assert.deepEqual(hitsIn(`        <pre className="hm-code">{\`import { Axon } from './packages/sdk-ts';`), []);
});

test("the two code rules are narrow: copy that looks a little like code is still read", () => {
  // A single word is not a column list, however lower-case it is.
  assert.deepEqual(words(`        <div className="t">Chats</div>`), ["chats"]);
  assert.ok(!isCode("Chats"));
  // Capitalised copy with a comma is not a column list either.
  assert.deepEqual(words(`        <div className="t">Chats, folders and feeds</div>`), ["chats"]);
  // Copy may merely begin with the banned word "import"; an ES import has `from '...'`.
  assert.deepEqual(words(`        <div className="t">import your data</div>`), ["import"]);
  assert.ok(!isCode("import your data"));
  assert.ok(isCode(`import { Axon } from './packages/sdk-ts';`));
});

test("JSX text is scanned, and an apostrophe in it does not swallow the line", () => {
  assert.deepEqual(words(`        <div className="ax-card-title">Your chat history</div>`), ["chat"]);
  // "memory's" opens no string literal: the copy after it is still read.
  assert.deepEqual(words(`        <div className="t">Your memory's dashboard</div>`), ["dashboard"]);
  assert.deepEqual(words(`        <div className="t">Your memory's address</div>`), []);
});

test("template interpolation is code, the text around it is not", () => {
  assert.deepEqual(stringLiterals("const c = `cards ${n > 1 ? one : two} ready`;"), ["cards  ready"]);
  assert.deepEqual(words("const c = `cards ${n} ready`;"), []);
  assert.deepEqual(words("const c = `your ${n} folders`;"), ["folders"]);
  // A banned word only inside the interpolation is code, not copy.
  assert.deepEqual(words("const c = `a ${pick('chat')} b`;"), []);
});

test("comments, imports and lexicon-ok lines are skipped", () => {
  assert.deepEqual(proseOf(`  // no "dashboard" here (canon words only).`), []);
  assert.deepEqual(proseOf(`   * nothing that looks like a chat box`), []);
  assert.deepEqual(proseOf(`import { useAlert } from './alerts and feeds';`), []);
  assert.deepEqual(proseOf(`        <div>Your chat history</div> {/* lexicon-ok: quoting a competitor */}`), []);
});

test("a banned word is matched on whole words only", () => {
  assert.equal(hitIn("Your chat history"), "chat");
  assert.equal(hitIn("Threads and Facets"), null);
  assert.equal(hitIn("last_synced_at"), null);     // _ is a word char: no boundary before "synced"
  assert.equal(hitIn("a tagline per plan"), null); // "tag" is not a word here
  assert.equal(hitIn("ChatGPT, Cursor and Claude"), null);
});

test("short strings and attribute values are not prose", () => {
  assert.deepEqual(words(`        {error && <div role="alert" style={{ padding: '9px 12px' }}>{error}</div>}`), []);
  assert.deepEqual(words(`      alert(err.message);`), []);
  assert.deepEqual(words(`const ALIAS = { dashboard: 'recall', billing: 'you' };`), []);
});
