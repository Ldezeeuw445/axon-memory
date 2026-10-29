#!/usr/bin/env node
// Lexicon guard (Docs/axon/AXON_Lexicon.md). Scans the user-visible text of
// the product shell and the landing page — JSX text and quoted strings that
// read like prose — for words the canon never shows a person.
// Usage: node scripts/check-lexicon.mjs [files...]   (exit 1 on a hit)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['chat', 'chats', 'conversation', 'conversations', 'folder', 'folders', 'workspace', 'workspaces',
  'knowledge base', 'assistant', 'assistants', 'bot', 'bots', 'copilot', 'database', 'databases', 'history',
  'archive', 'archived', 'prompt', 'prompts', 'notification', 'notifications', 'dashboard', 'session', 'sessions',
  'sync', 'synced', 'syncing', 'import', 'imported', 'feed', 'feeds', 'tag', 'tags', 'category', 'categories',
  'alert', 'alerts', 'context', 'military-grade', 'oops'];
const DEFAULT = ['src/pages/AppShell.jsx', 'src/pages/Home.jsx', 'src/pages/Login.jsx', 'src/pages/MemoryGraph.jsx',
  'src/components/ErrorBoundary.jsx', 'src/pages/Onboarding.jsx', 'src/pages/Settings.jsx',
  'src/pages/Subscription.jsx', 'src/pages/Splash.jsx', 'src/pages/ConnectAuthorize.jsx', 'src/pages/ConnectError.jsx',
  'src/pages/NotFound.jsx', 'src/pages/facets', 'src/components/app', 'src/components/home', 'src/lib/planCatalog.js'];

const files = [];
const walk = (p) => { try { const st = statSync(p); if (st.isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f))); else if (/\.(jsx?|tsx?)$/.test(p)) files.push(p); } catch { /* optional path */ } };
(process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT).forEach(walk);

const re = new RegExp(`\\b(${FORBIDDEN.map((w) => w.replace(/[-]/g, '\\-')).join('|')})\\b`, 'i');
let hits = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('import ')) return;
    if (/lexicon-ok/.test(line)) return;
    const prose = [];
    for (const m of line.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) prose.push(m[1]);               // JSX text
    for (const m of line.matchAll(/(['"`])((?:(?!\1).)*\s(?:(?!\1).)*)\1/g)) prose.push(m[2]);         // strings with a space
    if (/^[A-Za-z][^<>{}=;()]*$/.test(t) && !/[=;(){}]/.test(t) && t.split(' ').length > 2) prose.push(t); // wrapped JSX text
    for (const p of prose) {
      const cleaned = p.replace(/ChatGPT|chatgpt\.com|className|\$\{[^}]*\}/g, '');
      const m = cleaned.match(re);
      if (m) { hits++; console.log(`${f}:${i + 1}: "${m[0]}" in: ${p.trim().slice(0, 100)}`); }
    }
  });
}
console.log(hits ? `\n${hits} lexicon hit(s) in ${files.length} files.` : `Lexicon clean (${files.length} files).`);
process.exit(hits ? 1 : 0);
