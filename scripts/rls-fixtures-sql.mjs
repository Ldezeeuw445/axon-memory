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
  // A failed capture (as a store outage would leave it) so the live suite can
  // prove retry_capture re-runs it from its saved payload.
  const failedCaptureId = randomUUID();
  const queued = `queued capture ${who} ${randomBytes(5).toString('hex')}`;
  fx[who] = { id, email, password, apiKey, failedCaptureId, queued };
  sql += `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
  extensions.crypt('${password}', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', '', '', '', '', '');
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('${id}', '${id}', jsonb_build_object('sub', '${id}', 'email', '${email}', 'email_verified', true), 'email', now(), now(), now());
insert into public.api_keys (user_id, name, key_prefix, key_hash) values ('${id}', 'rls-test', '${apiKey.slice(0, 14)}', '${hash}');
insert into public.capture_events (id, user_id, channel, status, stage, error, error_code, retryable, payload)
values ('${failedCaptureId}', '${id}', 'offline', 'failed', 'store', 'simulated outage', 'test', true,
  jsonb_build_object('content', '${queued}', 'title', null, 'tags', '[]'::jsonb, 'facets', '[]'::jsonb, 'project', null,
                     'source_label', 'rls-test', 'idempotency_key', null, 'occurred_at', now()));
`;
}
// OAuth fixtures for user A (A5-4/A5-5): one public client, a valid S256
// code, a legacy 'plain' code, a grandfathered OAuth token (no expiry) and an
// expired one. The client row is not owned by a user, so cleanup removes it by
// name (tests/rls/cleanup-http-fixtures.sql).
{
  const sha = (v) => createHash('sha256').update(v).digest('hex');
  const b64u = (v) => createHash('sha256').update(v).digest('base64url');
  const tag = randomBytes(5).toString('hex');
  const clientId = `axon_client_rlstest${tag}`;
  const redirectUri = 'https://rls-test.invalid/callback';
  const verifier = randomBytes(32).toString('base64url');
  const code = `axoncode_${randomBytes(24).toString('hex')}`;
  const plainVerifier = randomBytes(32).toString('base64url');
  const plainCode = `axoncode_${randomBytes(24).toString('hex')}`;
  const legacyKey = `axon_live_${randomBytes(24).toString('hex')}`;
  const expiredKey = `axon_live_${randomBytes(24).toString('hex')}`;
  const a = fx.a;
  a.oauth = { clientId, redirectUri, verifier, code, plainVerifier, plainCode, legacyKey, expiredKey };
  // SDK integration (A7-1): a thread to scope by and a read-only personal key.
  a.threadKey = `sdk-${tag}`;
  a.readOnlyKey = `axon_live_${randomBytes(24).toString('hex')}`;
  sql += `insert into public.projects (user_id, key, name) values ('${a.id}', '${a.threadKey}', 'SDK test ${tag}');
insert into public.api_keys (user_id, name, key_prefix, key_hash, scope)
values ('${a.id}', 'rls-test read-only', '${a.readOnlyKey.slice(0, 14)}', '${sha(a.readOnlyKey)}', 'memory.read');
`;
  sql += `insert into public.oauth_clients (client_id, client_name, redirect_uris, is_public, created_via)
values ('${clientId}', 'rls-test oauth ${tag}', array['${redirectUri}'], true, 'manual');
insert into public.oauth_authorization_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at)
values ('${sha(code)}', '${clientId}', '${a.id}', '${redirectUri}', '${b64u(verifier)}', 'S256', 'memory.read memory.write', now() + interval '30 minutes'),
       ('${sha(plainCode)}', '${clientId}', '${a.id}', '${redirectUri}', '${plainVerifier}', 'plain', 'memory.read memory.write', now() + interval '30 minutes');
insert into public.api_keys (user_id, name, key_prefix, key_hash, oauth_client_id, scope)
values ('${a.id}', 'rls-test legacy oauth', '${legacyKey.slice(0, 14)}', '${sha(legacyKey)}', '${clientId}', 'memory.read memory.write');
insert into public.api_keys (user_id, name, key_prefix, key_hash, oauth_client_id, scope, access_expires_at)
values ('${a.id}', 'rls-test expired oauth', '${expiredKey.slice(0, 14)}', '${sha(expiredKey)}', '${clientId}', 'memory.read memory.write', now() - interval '1 minute');
`;
}
sql += 'commit;\n';
writeFileSync(out, JSON.stringify(fx, null, 2));
process.stdout.write(sql);
