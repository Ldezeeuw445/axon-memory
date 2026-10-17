#!/usr/bin/env node
// Runs tests/rls/isolation.sql (database-layer tenant isolation, one rolled-back
// transaction) with psql and fails on any non-passing check.
// Env: SUPABASE_DB_URL (postgres connection string with the postgres role).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const db = process.env.SUPABASE_DB_URL;
if (!db) { console.error('rls-isolation: SUPABASE_DB_URL not set.'); process.exit(2); }
const file = fileURLToPath(new URL('../tests/rls/isolation.sql', import.meta.url));
const out = execFileSync('psql', [db, '-X', '-q', '-t', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8' });
const rows = out.trim().split('\n').filter((l) => l.split('\t').length === 5).map((l) => {
  const [area, name, pass, severity, detail] = l.split('\t');
  return { area, name, pass: pass === 't', severity, detail };
});
if (rows.length < 100) { console.error(`rls-isolation: only ${rows.length} checks reported — suite did not run fully.`); process.exit(1); }
for (const r of rows) console.log(`${r.pass ? '✓' : '✗'} [${r.severity}/${r.area}] ${r.name} — ${r.detail}`);
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  const leaks = failed.filter((r) => r.severity === 'leak');
  if (leaks.length) console.log(`TENANT ISOLATION LEAK (${leaks.length}) — RELEASE BLOCKER`);
  process.exit(1);
}
