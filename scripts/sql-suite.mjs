#!/usr/bin/env node
// Runs rolled-back SQL test suites (tests/rls/*.sql, tests/schema/*.sql) with psql.
// Each suite prints rows: area, check_name, pass, severity, detail. Fails on any non-pass.
// Usage: SUPABASE_DB_URL=… node scripts/sql-suite.mjs [file…]   (default: all suites)
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const db = process.env.SUPABASE_DB_URL;
if (!db) { console.error('sql-suite: SUPABASE_DB_URL not set.'); process.exit(2); }
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['tests/schema', 'tests/rls'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.sql') && !f.startsWith('cleanup')).map((f) => `${d}/${f}`));
let failed = 0;
for (const file of files) {
  const out = execFileSync('psql', [db, '-X', '-q', '-t', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8' });
  const rows = out.trim().split('\n').filter((l) => l.split('\t').length === 5).map((l) => {
    const [area, name, pass, severity, detail] = l.split('\t');
    return { area, name, pass: pass === 't', severity, detail };
  });
  if (rows.length < 10) { console.error(`${file}: only ${rows.length} checks reported — suite did not run fully.`); failed++; continue; }
  const bad = rows.filter((r) => !r.pass);
  console.log(`\n== ${file}: ${rows.length - bad.length}/${rows.length} passed`);
  for (const r of bad) console.log(`✗ [${r.severity}/${r.area}] ${r.name} — ${r.detail}`);
  if (bad.some((r) => r.severity === 'leak')) console.log('TENANT ISOLATION LEAK — RELEASE BLOCKER');
  failed += bad.length;
}
process.exit(failed ? 1 : 0);
