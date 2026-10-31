#!/usr/bin/env node
// Lexicon guard (Docs/axon/AXON_Lexicon.md). Scans the user-visible text of
// the product shell and the landing page — JSX text and quoted strings that
// read like prose — for words the canon never shows a person.
// Usage: node scripts/check-lexicon.mjs [files...]   (exit 1 on a hit)
//
// Unit tests for the extractor: node --test scripts/check-lexicon.test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FORBIDDEN = ['chat', 'chats', 'conversation', 'conversations', 'folder', 'folders', 'workspace', 'workspaces',
  'knowledge base', 'assistant', 'assistants', 'bot', 'bots', 'copilot', 'database', 'databases', 'history',
  'archive', 'archived', 'prompt', 'prompts', 'notification', 'notifications', 'dashboard', 'session', 'sessions',
  'sync', 'synced', 'syncing', 'import', 'imported', 'feed', 'feeds', 'tag', 'tags', 'category', 'categories',
  'alert', 'alerts', 'context', 'military-grade', 'oops'];
const DEFAULT = ['src/pages/AppShell.jsx', 'src/pages/Home.jsx', 'src/pages/Login.jsx', 'src/pages/MemoryGraph.jsx',
  'src/components/ErrorBoundary.jsx', 'src/pages/Onboarding.jsx', 'src/pages/Settings.jsx',
  'src/pages/Subscription.jsx', 'src/pages/Splash.jsx', 'src/pages/ConnectAuthorize.jsx', 'src/pages/ConnectError.jsx',
  'src/pages/NotFound.jsx', 'src/pages/Developers.jsx', 'src/pages/Privacy.jsx', 'src/pages/Terms.jsx', 'src/pages/facets',
  'src/components/app', 'src/components/home', 'src/lib/planCatalog.js'];

const re = new RegExp(`\\b(${FORBIDDEN.map((w) => w.replace(/[-]/g, '\\-')).join('|')})\\b`, 'i');

/**
 * The string literals on one line, in source order.
 *
 * Walks the line character by character instead of regex-matching quote pairs.
 * A global regex pairs the *closing* quote of one literal with the *opening*
 * quote of the next, so on a line with two literals it hands back the comma
 * between them and never looks inside the second one — copy after the first
 * string on a line went unscanned. `${...}` inside a template literal is code,
 * so it is dropped (brace-depth aware, so nested objects survive).
 *
 * An unterminated `'` or `"` is an apostrophe in prose ("your memory's
 * address"), not a literal: it is discarded and scanning of the line stops,
 * because the JSX-text rule already covers that copy. An unterminated
 * backtick opens a multi-line template, whose first line is kept.
 */
export function stringLiterals(line) {
  const literals = [];
  let i = 0;
  while (i < line.length) {
    const quote = line[i];
    if (quote !== "'" && quote !== '"' && quote !== '`') { i += 1; continue; }
    i += 1;
    let text = '';
    let closed = false;
    while (i < line.length) {
      const c = line[i];
      if (c === '\\') { text += line[i + 1] ?? ''; i += 2; continue; }
      if (c === quote) { closed = true; i += 1; break; }
      if (quote === '`' && c === '$' && line[i + 1] === '{') {
        i += 2;
        for (let depth = 1; i < line.length && depth > 0; i += 1) {
          if (line[i] === '{') depth += 1;
          else if (line[i] === '}') depth -= 1;
        }
        continue;
      }
      text += c;
      i += 1;
    }
    if (closed) { literals.push(text); continue; }
    if (quote === '`') literals.push(text);
    break;
  }
  return literals;
}

// Two or more lower-case identifiers separated by commas: a column list for
// .select() ('id, statement, category, source_item_ids'), not a sentence.
// Deliberately narrow — no /i flag and at least one comma — so that single
// words and Capitalised copy ("Chats", "Chats, folders") are still read.
const IDENT_LIST = /^[a-z0-9_]+(?:\s*,\s*[a-z0-9_]+)+$/;
// An ES import is code wherever it sits: on its own line, or inside a code
// sample a developer page prints. The `from '...'` is required, so copy that
// merely starts with the banned word "import" is still read.
const IMPORT_STMT = /^\s*import\s.*\sfrom\s*['"`]/;

/** Code that happens to contain a banned word, rather than copy a person reads. */
export function isCode(piece) {
  return IDENT_LIST.test(piece.trim()) || IMPORT_STMT.test(piece);
}

/** The pieces of one line that a person could read. */
export function proseOf(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('import ')) return [];
  if (/lexicon-ok/.test(line)) return [];
  const prose = [];
  for (const m of line.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) prose.push(m[1]);               // JSX text
  for (const s of stringLiterals(line)) if (/\s/.test(s)) prose.push(s);                          // strings that read like prose
  if (/^[A-Za-z][^<>{}=;()]*$/.test(t) && !/[=;(){}]/.test(t) && t.split(' ').length > 2) prose.push(t); // wrapped JSX text
  return prose.filter((p) => !isCode(p));
}

/** The banned word in a piece of prose, or null. */
export function hitIn(piece) {
  const m = piece.replace(/ChatGPT|chatgpt\.com|className/g, '').match(re);
  return m ? m[0] : null;
}

/** Every hit in a file, as { line, word, text }. */
export function hitsIn(source) {
  const hits = [];
  source.split('\n').forEach((line, i) => {
    for (const piece of proseOf(line)) {
      const word = hitIn(piece);
      if (word) hits.push({ line: i + 1, word, text: piece.trim().slice(0, 100) });
    }
  });
  return hits;
}

function main(argv) {
  const files = [];
  const walk = (p) => { try { const st = statSync(p); if (st.isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f))); else if (/\.(jsx?|tsx?)$/.test(p)) files.push(p); } catch { /* optional path */ } };
  (argv.length ? argv : DEFAULT).forEach(walk);

  let hits = 0;
  for (const f of files) {
    for (const h of hitsIn(readFileSync(f, 'utf8'))) {
      hits += 1;
      console.log(`${f}:${h.line}: "${h.word}" in: ${h.text}`);
    }
  }
  console.log(hits ? `\n${hits} lexicon hit(s) in ${files.length} files.` : `Lexicon clean (${files.length} files).`);
  return hits ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
