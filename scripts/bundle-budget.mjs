#!/usr/bin/env node
// What a phone must download before the first screen (A-perf-1): the entry
// script, its modulepreloads and the entry CSS. Fails the gate when it grows
// past the budget or when three.js creeps back onto the critical path.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const dist = process.argv[2] || 'dist';
const BUDGET_KB = Number(process.env.BUDGET_KB || 240);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
let total = 0; const rows = [];
let three = false;
for (const f of files) {
  const buf = readFileSync(join(dist, f));
  const gz = gzipSync(buf).length; total += gz;
  if (f.endsWith('.js') && /WebGLRenderer|THREE\.WebGLRenderer|precision highp float/.test(buf.toString())) three = true;
  rows.push(`${(gz / 1024).toFixed(1).padStart(7)} kB  ${f}`);
}
console.log(rows.join('\n'));
console.log(`critical path: ${(total / 1024).toFixed(1)} kB gzip (budget ${BUDGET_KB} kB)`);
if (three) { console.error('FAIL: three.js is on the critical path'); process.exit(1); }
if (total / 1024 > BUDGET_KB) { console.error('FAIL: over budget'); process.exit(1); }
