#!/usr/bin/env node
// AXON Memory — tenant isolation over the real network surfaces (spec §17, A5-1).
//
// Complements tests/rls/isolation.sql (database layer, rolled back). This one
// drives the DEPLOYED stack with two disposable users and proves user A cannot
// reach user B's data through: PostgREST rows + RPC, Storage, the context-pack
// REST API (JWT and API key), the remember API, and the MCP server (direct and
// through the mcp.axon-memory.com gateway). It ends by deleting both users
// through the real delete-account function and checks A's deletion leaves B
// intact.
//
// Fixtures — one of:
//   SUPABASE_SERVICE_ROLE_KEY set → users + API keys are provisioned and
//     cleaned up by this script (CI mode).
//   RLS_FIXTURES=/path/fixtures.json → pre-provisioned users (see
//     tests/rls/provision-http-fixtures.sql), shape:
//     { "a": {"id","email","password","apiKey"}, "b": {...} }
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, optional MCP_GATEWAY_URL
//      (default https://mcp.axon-memory.com).
// Exit 0 = no leak. Exit 1 = a leak or a broken check (release blocker).
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY = process.env.MCP_GATEWAY_URL ?? 'https://mcp.axon-memory.com';
if (!URL_ || !ANON || (!SERVICE && !process.env.RLS_FIXTURES)) {
  console.error('rls-isolation-http: need SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY or RLS_FIXTURES.');
  process.exit(2);
}

const results = [];
const check = (area, name, pass, detail = '') => {
  results.push({ area, name, pass: !!pass, detail });
  console.log(`${pass ? '✓' : '✗ LEAK/FAIL'} [${area}] ${name}${detail ? ` — ${detail}` : ''}`);
};
const j = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } };
const has = (body, needles) => {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  return needles.filter(Boolean).some((n) => s.toLowerCase().includes(String(n).toLowerCase()));
};

async function provisionWithServiceRole() {
  const mk = async (who) => {
    const tag = `rlshttp${who}${randomBytes(6).toString('hex')}`;
    const email = `${tag}@rls-test.invalid`;
    const password = `R1s!${randomBytes(12).toString('hex')}`;
    const res = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const u = await j(res);
    if (!res.ok) throw new Error(`provision ${who}: ${res.status} ${JSON.stringify(u)}`);
    const apiKey = `axon_live_${randomBytes(24).toString('hex')}`;
    const kr = await fetch(`${URL_}/rest/v1/api_keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u.id, name: 'rls-test', key_prefix: apiKey.slice(0, 14),
        key_hash: createHash('sha256').update(apiKey).digest('hex') }),
    });
    if (!kr.ok) throw new Error(`api key ${who}: ${kr.status} ${await kr.text()}`);
    return { id: u.id, email, password, apiKey };
  };
  return { a: await mk('a'), b: await mk('b') };
}

async function login(u) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.password }),
  });
  const body = await j(res);
  if (!res.ok || !body.access_token) throw new Error(`login ${u.email}: ${res.status} ${JSON.stringify(body)}`);
  return body.access_token;
}

const rest = (jwt, path, init = {}) => fetch(`${URL_}/rest/v1/${path}`, {
  ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});
const fn = (bearer, name, body, method = 'POST') => fetch(`${URL_}/functions/v1/${name}`, {
  method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', apikey: ANON },
  body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
});
let rpcId = 1;
const mcp = (base, key, method, params) => fetch(base, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
});

async function main() {
  const fx = SERVICE ? await provisionWithServiceRole() : JSON.parse(readFileSync(process.env.RLS_FIXTURES, 'utf8'));
  const { a, b } = fx;
  const tokA = `rlstokena${randomBytes(5).toString('hex')}`;
  const tokB = `rlstokenb${randomBytes(5).toString('hex')}`;
  // Needles are the stored CONTENT, never the bare token: responses echo the
  // query back, so a bare token would match the echo, not a leaked memory.
  const contentB = `B private decision ${tokB}`, titleB = `B secret ${tokB}`, contentA = `A note ${tokA}`;
  let deletedA = false, deletedB = false;

  try {
    const jwtA = await login(a);
    const jwtB = await login(b);
    check('auth', 'both disposable users log in', jwtA && jwtB);

    // Seed through the real write path (remember API, API-key auth).
    const rb = await fn(b.apiKey, 'remember', { content: contentB, title: titleB });
    const rbBody = await j(rb);
    check('api', 'B remembers a canary via /remember', rb.ok && rbBody.id, `status ${rb.status}`);
    const bItem = rbBody.id;
    // A tries to write INTO B by naming B in the body; must land on A.
    const ra = await fn(a.apiKey, 'remember', { content: contentA, title: `A ${tokA}`, user_id: b.id, userId: b.id });
    check('api', 'A remembers its own canary (spoofed user_id in body)', ra.ok, `status ${ra.status}`);

    // ── PostgREST rows (A's JWT, aimed at B) ──
    const tables = ['memory_items', 'memory_facts', 'memory_recalls', 'api_keys', 'source_connections', 'projects',
      'project_threads', 'project_repos', 'entities', 'entity_links', 'context_pack_logs', 'subscriptions',
      'recall_rules', 'workspaces', 'workspace_tasks', 'workspace_catch', 'workspace_docs', 'workspace_events',
      'workspace_links', 'workspace_phases', 'workspace_team', 'workspace_work', 'memory_hub_counts',
      'memory_facts_with_source', 'memory_by_repo', 'user_plan_status'];
    for (const t of tables) {
      const res = await rest(jwtA, `${t}?select=*&user_id=eq.${b.id}`);
      const body = await j(res);
      check('rest', `${t} rows of B via A's JWT`, !res.ok || (Array.isArray(body) && body.length === 0), `status ${res.status}, ${Array.isArray(body) ? body.length : '-'} rows`);
    }
    {
      const res = await rest(jwtA, `profiles?select=*&id=eq.${b.id}`); const body = await j(res);
      check('rest', 'profiles row of B via A', Array.isArray(body) && body.length === 0, `${body.length ?? '-'} rows`);
      const r2 = await rest(jwtA, `memory_items?select=*&id=eq.${bItem}`); const b2 = await j(r2);
      check('rest', "B's memory item by id via A", Array.isArray(b2) && b2.length === 0, `${b2.length ?? '-'} rows`);
      const r3 = await rest(jwtA, `memory_embeddings?select=memory_item_id&memory_item_id=eq.${bItem}`); const b3 = await j(r3);
      check('semantic', "B's embedding via A", !r3.ok || (Array.isArray(b3) && b3.length === 0), `${b3.length ?? '-'} rows`);
      const r4 = await rest(jwtA, `memory_items?select=id`); const b4 = await j(r4);
      check('rest', 'unfiltered memory_items scan by A contains no B item', Array.isArray(b4) && !has(b4, [bItem]), `${b4.length ?? '-'} rows`);
      const r5 = await rest(jwtA, `memory_items?id=eq.${bItem}`, { method: 'PATCH', body: JSON.stringify({ title: 'pwned' }), headers: { Prefer: 'return=representation' } });
      const b5 = await j(r5);
      check('rest', "A PATCHes B's memory item", !r5.ok || (Array.isArray(b5) && b5.length === 0), `status ${r5.status}`);
      const r6 = await rest(jwtA, `memory_items?id=eq.${bItem}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      const b6 = await j(r6);
      check('rest', "A DELETEs B's memory item", !r6.ok || (Array.isArray(b6) && b6.length === 0), `status ${r6.status}`);
    }

    // ── RPC ──
    for (const [name, args] of [
      ['memory_breakdown', { p_user_id: b.id }], ['memory_source_breakdown', { p_user_id: b.id }],
      ['memory_reach_summary', { p_user_id: b.id }], ['top_entities', { p_user_id: b.id }],
      ['related_memories', { p_user_id: b.id, p_memory_item_id: bItem, p_min_shared: 1 }],
      ['search_memory_items', { p_user_id: b.id, p_query: tokB }],
      ['search_memory_items', { p_user_id: a.id, p_query: tokB }],
    ]) {
      const res = await rest(jwtA, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
      const body = await j(res);
      check('rpc', `${name}(${Object.values(args)[0] === b.id ? 'B' : 'A'}) via A`, !res.ok || (Array.isArray(body) && body.length === 0), `status ${res.status}`);
    }
    for (const [name, args] of [
      ['match_memory_items', { p_user_id: b.id, p_query_embedding: `[${Array(1536).fill(0.01).join(',')}]`, p_match_count: 50 }],
      ['record_memory_recalls', { p_user_id: b.id, p_item_ids: [bItem], p_client_key: 'x', p_client_label: 'x', p_api_key_id: null }],
      ['get_embedding_usage_today', { p_user_id: b.id }], ['tick_starter_tasks', { p_user_id: b.id }],
    ]) {
      const res = await rest(jwtA, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
      check('rpc', `backend-only ${name} refused for A's JWT`, !res.ok, `status ${res.status}`);
      const ra2 = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      check('anon', `backend-only ${name} refused for anon`, !ra2.ok, `status ${ra2.status}`);
    }
    {
      const res = await fetch(`${URL_}/rest/v1/memory_items?select=id&limit=5`, { headers: { apikey: ANON } });
      const body = await j(res);
      check('anon', 'anon reads no memory_items', !res.ok || (Array.isArray(body) && body.length === 0), `status ${res.status}`);
    }

    // ── Storage ──
    {
      const up = await fetch(`${URL_}/storage/v1/object/note-files/${b.id}/${tokB}.txt`, {
        method: 'POST', headers: { Authorization: `Bearer ${jwtB}`, apikey: ANON, 'Content-Type': 'text/plain' }, body: `B file ${tokB}` });
      check('storage', 'B uploads into own folder (control)', up.ok, `status ${up.status}`);
      const list = await fetch(`${URL_}/storage/v1/object/list/note-files`, {
        method: 'POST', headers: { Authorization: `Bearer ${jwtA}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: `${b.id}/`, limit: 100 }) });
      const lb = await j(list);
      check('storage', "A lists B's note-files folder", !list.ok || (Array.isArray(lb) && lb.length === 0), `status ${list.status}`);
      const get = await fetch(`${URL_}/storage/v1/object/authenticated/note-files/${b.id}/${tokB}.txt`, { headers: { Authorization: `Bearer ${jwtA}`, apikey: ANON } });
      check('storage', "A downloads B's file", !get.ok, `status ${get.status}`);
      const put = await fetch(`${URL_}/storage/v1/object/note-files/${b.id}/planted.txt`, {
        method: 'POST', headers: { Authorization: `Bearer ${jwtA}`, apikey: ANON, 'Content-Type': 'text/plain' }, body: 'planted' });
      check('storage', "A uploads into B's folder", !put.ok, `status ${put.status}`);
    }

    // ── context-pack API ──
    for (const [label, bearer] of [['JWT', jwtA], ['API key', a.apiKey]]) {
      const res = await fn(bearer, 'context-pack', { query: tokB });
      const body = await j(res);
      check('api', `context-pack (${label}) as A, query = B canary`, res.ok && !has(body, [contentB, titleB, bItem, b.email]), `status ${res.status}`);
      const res2 = await fn(bearer, 'context-pack', {});
      const body2 = await j(res2);
      check('api', `context-pack (${label}) as A, unscoped`, res2.ok && !has(body2, [contentB, titleB, bItem, b.email]), `status ${res2.status}`);
    }
    {
      const res = await fn(jwtA, 'context-pack', { query: tokA });
      check('control', 'context-pack as A finds own canary', has(await j(res), [contentA]), `status ${res.status}`);
      const rbB = await fn(jwtB, 'context-pack', { query: tokA });
      check('api', "context-pack as B, query = A's (spoofed-as-B) canary", rbB.ok && !has(await j(rbB), [contentA]), `status ${rbB.status}`);
      const own = await fn(jwtB, 'context-pack', { query: tokB });
      check('control', 'context-pack as B finds own canary', has(await j(own), [contentB]), `status ${own.status}`);
      const bad = await fn('axon_live_' + 'f'.repeat(48), 'context-pack', { query: tokB });
      check('api', 'context-pack with a forged key is refused', bad.status === 401, `status ${bad.status}`);
    }

    // ── MCP (function URL and public gateway) ──
    for (const [label, base] of [['mcp-server', `${URL_}/functions/v1/mcp-server`], ['gateway', GATEWAY]]) {
      const calls = [
        ['recall_context', { query: tokB }], ['recall_context', {}], ['list_projects', {}],
        ['list_sources', {}], ['list_tasks', { all: true }], ['list_work', { all: true }],
      ];
      for (const [tool, args] of calls) {
        const res = await mcp(base, a.apiKey, 'tools/call', { name: tool, arguments: args });
        const body = await j(res);
        check('mcp', `${label}: A ${tool}(${JSON.stringify(args)}) has no B data`, res.ok && !has(body, [contentB, titleB, bItem, b.email]), `status ${res.status}`);
      }
      const forged = await mcp(base, 'axon_live_' + '0'.repeat(48), 'tools/call', { name: 'recall_context', arguments: { query: tokB } });
      check('mcp', `${label}: forged bearer refused`, forged.status === 401 || has(await j(forged), ['unauthorized']), `status ${forged.status}`);
      const own = await mcp(base, a.apiKey, 'tools/call', { name: 'recall_context', arguments: { query: tokA } });
      check('control', `${label}: A recalls own canary over MCP`, has(await j(own), [contentA]), `status ${own.status}`);
    }

    // ── Exports ──
    check('export', 'no export endpoint exists yet — add a case here when data export ships', true, 'skipped (surface absent)');

    // ── Deletion boundary: A deletes itself, B is untouched ──
    {
      const del = await fn(jwtA, 'delete-account', {});
      deletedA = del.ok;
      check('delete', 'A deletes own account via delete-account', del.ok, `status ${del.status}`);
      const jwtB2 = await login(b);
      const res = await fn(jwtB2, 'context-pack', { query: tokB });
      check('delete', "B's memory survives A's deletion", has(await j(res), [contentB]), `status ${res.status}`);
      const old = await fn(a.apiKey, 'context-pack', { query: tokA });
      check('delete', "A's API key dies with A", old.status === 401, `status ${old.status}`);
      await fetch(`${URL_}/storage/v1/object/note-files`, { method: 'DELETE',
        headers: { Authorization: `Bearer ${jwtB2}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [`${b.id}/${tokB}.txt`] }) });
      const delB = await fn(jwtB2, 'delete-account', {});
      deletedB = delB.ok;
      check('delete', 'B deletes own account (cleanup)', delB.ok, `status ${delB.status}`);
    }
  } finally {
    if (SERVICE) {
      for (const [u, done] of [[a, deletedA], [b, deletedB]]) {
        if (!done) await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE } });
      }
    } else if (!deletedA || !deletedB) {
      console.log('NOTE: pre-provisioned users not fully deleted — run tests/rls/cleanup-http-fixtures.sql');
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILURES (release blockers):'); failed.forEach((f) => console.log(`  [${f.area}] ${f.name} — ${f.detail}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
