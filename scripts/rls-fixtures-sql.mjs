#!/usr/bin/env node
// Prints SQL that provisions two disposable users (+ one API key each) for
// scripts/rls-isolation-http.mjs when no service-role key is at hand, and
// writes the matching fixtures JSON. Run the SQL as postgres (SQL editor /
// MCP execute_sql), then: RLS_FIXTURES=<json> node scripts/rls-isolation-http.mjs
// Cleanup is automatic (delete-account); tests/rls/cleanup-http-fixtures.sql is
// the fallback.  Usage: node scripts/rls-fixtures-sql.mjs /tmp/rls-fixtures.json > /tmp/provision.sql
import { writeFileSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const out = process.argv[2] ?? '/tmp/rls-fixtures.json';
const fx = {};
let sql = 'begin;\n';
for (const who of ['a', 'b']) {
  const id = randomUUID();
  const email = `rlshttp${who}${randomBytes(6).toString('hex')}@rls-test.invalid`;
  const password = `R1s!${randomBytes(12).toString('hex')}`;
  const apiKey = `axon_live_${randomBytes(24).toString('hex')}`;
  const hash = createHash('sha256').update(apiKey).digest('hex');
  fx[who] = { id, email, password, apiKey };
  sql += `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
  extensions.crypt('${password}', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', '', '', '', '', '');
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('${id}', '${id}', jsonb_build_object('sub', '${id}', 'email', '${email}', 'email_verified', true), 'email', now(), now(), now());
insert into public.api_keys (user_id, name, key_prefix, key_hash) values ('${id}', 'rls-test', '${apiKey.slice(0, 14)}', '${hash}');
`;
}
sql += 'commit;\n';
writeFileSync(out, JSON.stringify(fx, null, 2));
process.stdout.write(sql);
