#!/usr/bin/env node
// A11-1 guard: the €9.99 plan is called "Power" everywhere a person can read
// it. The internal key stays 'ultra' (DB enum, plan_features, Stripe metadata),
// so lowercase `ultra` as an identifier is allowed; a capitalised "Ultra" in
// user-facing source is not. Also checks the Stripe price ids did not move.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src', 'index.html', 'supabase/functions'];
const skip = /node_modules|\/dist(\/|$)|\.test\./;
const bad = [];
const walk = (p) => {
  if (skip.test(p)) return;
  const st = statSync(p);
  if (st.isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (!/\.(jsx?|tsx?|html|md)$/.test(p)) return;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (/\bUltra\b/.test(line) && !/internal key|\("ultra"\)|key "ultra"/.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`);
  });
};
roots.forEach((r) => { try { walk(r); } catch { /* missing root */ } });

const plans = readFileSync('supabase/functions/_shared/plans.ts', 'utf8');
const ids = ['price_1U1AfvFGBQHVlLfhO8uNIEWX', 'price_1U1620FGBQHVlLfhBfLCbaZM', 'price_1U1AhtFGBQHVlLfhfmRRvtjv', 'price_1U1AjIFGBQHVlLfhwDyO8RZl'];
const missing = ids.filter((id) => !plans.includes(id));
const keyKept = /ultra:\s*{\s*tier:\s*"ultra",\s*priceId:\s*"price_1U1AhtFGBQHVlLfhfmRRvtjv"/.test(plans);

if (bad.length) console.log('User-visible "Ultra" found:\n  ' + bad.join('\n  '));
if (missing.length) console.log('Stripe price ids changed/missing: ' + missing.join(', '));
if (!keyKept) console.log('Internal key "ultra" -> price_1U1AhtFGBQHVlLfhfmRRvtjv mapping changed');
const ok = !bad.length && !missing.length && keyKept;
console.log(ok ? 'plan names OK: no user-visible "Ultra"; internal key + 4 Stripe price ids unchanged' : 'FAILED');
process.exit(ok ? 0 : 1);
