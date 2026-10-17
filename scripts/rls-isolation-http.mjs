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
      'workspace_links', 'workspace_phases', 'workspace_team', 'workspace_work', 'memory_hub_counts', 'capture_events',
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

    // ── MCP lifecycle verbs (A6-1): capture/recall/supersede/retire/restore/delete ──
    {
      const tool = async (base, key, name, args) => {
        const res = await mcp(base, key, 'tools/call', { name, arguments: args });
        const body = await j(res);
        return { ok: res.ok, status: res.status, body, text: body?.result?.content?.[0]?.text ?? JSON.stringify(body), isError: !!body?.result?.isError };
      };
      const idOf = (t) => (t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) ?? [])[0];
      const tokL = `rlslife${randomBytes(5).toString('hex')}`;
      const v1 = `A lifecycle v1 ${tokL}`, v2 = `A lifecycle v2 ${tokL}`;
      const listed = await j(await mcp(GATEWAY, a.apiKey, 'tools/list', {}));
      const names = (listed?.result?.tools ?? []).map((t) => t.name);
      check('lifecycle', 'tools/list exposes capture/recall/retire/restore/supersede/delete next to the old tools',
        ['capture', 'recall', 'retire', 'restore', 'supersede', 'delete', 'remember', 'recall_context'].every((n) => names.includes(n)), names.join(','));
      const cap = await tool(GATEWAY, a.apiKey, 'capture', { content: v1 });
      const oldId = idOf(cap.text);
      check('lifecycle', 'A captures via capture (gateway)', cap.ok && !cap.isError && !!oldId, cap.text.slice(0, 120));
      const rec = await tool(GATEWAY, a.apiKey, 'recall', { query: tokL });
      check('lifecycle', 'recall returns the memory with its id', rec.text.includes(v1) && rec.text.includes(oldId), `status ${rec.status}`);
      {
        let pack = null; try { pack = JSON.parse(rec.text); } catch { /* not JSON */ }
        const mem = pack ? Object.values(pack.memory ?? {}).flat().find((m) => m.id === oldId) : null;
        check('recall', 'pack uses hybrid ranking', pack?.stats?.search_mode === 'hybrid', JSON.stringify(pack?.stats ?? null));
        check('recall', 'memory carries kind/source/confidence/relevance trace',
          mem?.kind === 'memory' && mem?.source?.channel === 'agent' && ['high', 'medium', 'low'].includes(mem?.confidence)
            && typeof mem?.relevance?.score === 'number' && Array.isArray(mem?.relevance?.matched_by) && mem.relevance.matched_by.includes('lexical'),
          JSON.stringify(mem ?? null).slice(0, 200));
        check('recall', 'legend distinguishes memory/inference/source/confidence',
          ['memory', 'inference', 'source', 'confidence'].every((k) => typeof pack?.how_to_use?.reading?.[k] === 'string'), '');
        check('recall', 'inferences are labelled (no bare-string `known`)', pack && !('known' in pack) && typeof pack.inferred === 'object', '');
      }
      const sup = await tool(GATEWAY, a.apiKey, 'supersede', { old_id: oldId, content: v2 });
      const newId = (sup.text.match(/with ([0-9a-f-]{36})/) ?? [])[1];
      check('lifecycle', 'supersede with new content', !sup.isError && !!newId && newId !== oldId, sup.text.slice(0, 160));
      const rec2 = await tool(GATEWAY, a.apiKey, 'recall', { query: tokL });
      check('lifecycle', 'recall after supersede shows v2, not v1', rec2.text.includes(v2) && !rec2.text.includes(v1), `status ${rec2.status}`);
      // B (another tenant) cannot touch A's memories on either transport.
      for (const [label, base] of [['mcp-server', `${URL_}/functions/v1/mcp-server`], ['gateway', GATEWAY]]) {
        for (const [name, args] of [['retire', { id: newId }], ['restore', { id: oldId }], ['delete', { id: newId, confirm: true }],
          ['supersede', { old_id: newId, content: `B hijack ${tokL}` }]]) {
          const r = await tool(base, b.apiKey, name, args);
          check('lifecycle', `${label}: B ${name} on A's memory is refused`, r.isError && /No memory with that id/.test(r.text), r.text.slice(0, 120));
        }
      }
      const stillThere = await tool(GATEWAY, a.apiKey, 'recall', { query: tokL });
      check('lifecycle', "A's memory unaffected by B's attempts", stillThere.text.includes(v2), '');
      const ret = await tool(GATEWAY, a.apiKey, 'retire', { id: newId, reason: 'test' });
      check('lifecycle', 'A retires own memory', !ret.isError && ret.text.startsWith('Retired'), ret.text.slice(0, 120));
      const rec3 = await tool(GATEWAY, a.apiKey, 'recall', { query: tokL });
      check('lifecycle', 'retired memory leaves recall', !rec3.text.includes(v2) && !rec3.text.includes(v1), '');
      const res = await tool(GATEWAY, a.apiKey, 'restore', { id: newId });
      const rec4 = await tool(GATEWAY, a.apiKey, 'recall', { query: tokL });
      check('lifecycle', 'restore brings it back', !res.isError && rec4.text.includes(v2), res.text.slice(0, 120));
      const noConfirm = await tool(GATEWAY, a.apiKey, 'delete', { id: newId });
      check('lifecycle', 'delete without confirm is refused', noConfirm.isError && /confirm/.test(noConfirm.text), noConfirm.text.slice(0, 120));
      const del = await tool(GATEWAY, a.apiKey, 'delete', { id: newId, confirm: true });
      check('lifecycle', 'delete with confirm: true succeeds', !del.isError && del.text.startsWith('Deleted'), del.text.slice(0, 160));
      const gone = await rest(jwtA, `memory_items?select=id&id=in.(${newId},${oldId})`);
      const goneB = await j(gone);
      check('lifecycle', 'deleted row is gone; superseded history row remains', Array.isArray(goneB) && goneB.length === 1 && goneB[0].id === oldId, JSON.stringify(goneB));
      const rec5 = await tool(GATEWAY, a.apiKey, 'recall', { query: tokL });
      check('lifecycle', 'deleted memory never returns in recall', !rec5.text.includes(v2) && !rec5.text.includes(newId), '');
      const again = await tool(GATEWAY, a.apiKey, 'retire', { id: newId });
      check('lifecycle', 'acting on a deleted id says not found', again.isError && /No memory with that id/.test(again.text), again.text.slice(0, 120));
      const health = await fetch(`${GATEWAY}/health`);
      const hb = await j(health);
      check('lifecycle', 'gateway GET /health is 200 with no user data', health.ok && hb.status === 'ok' && !has(hb, [a.email, b.email, a.id, b.id]), `status ${health.status}`);
    }

    // ── Capture pipeline (A2-1): idempotency, dedupe, visible + retryable failures ──
    {
      const tokC = `rlscap${randomBytes(5).toString('hex')}`;
      const key = `phone-queue:${tokC}`;
      const body1 = { content: `A captured offline ${tokC}`, idempotency_key: key, channel: 'offline', occurred_at: new Date(Date.now() - 3600_000).toISOString() };
      const tC = Date.now();
      const c1 = await fn(a.apiKey, 'remember', body1); const c1b = await j(c1);
      const c1ms = Date.now() - tC;
      check('capture', 'REST capture returns id, status and capture_id', c1.ok && c1b.id && c1b.capture_id && ['indexed', 'stored'].includes(c1b.status), JSON.stringify(c1b));
      const c2 = await fn(a.apiKey, 'remember', body1); const c2b = await j(c2);
      check('capture', 'same idempotency key again -> same memory, not stored twice', c2.ok && c2b.id === c1b.id && c2b.status === 'duplicate', JSON.stringify(c2b));
      const rows = await j(await rest(jwtA, `memory_items?select=id,occurred_at,origin_key&content=eq.${encodeURIComponent(body1.content)}`));
      check('capture', 'exactly one row for the queued capture, with its original occurred_at', Array.isArray(rows) && rows.length === 1
        && Math.abs(Date.parse(rows[0].occurred_at) - Date.parse(body1.occurred_at)) < 2000, JSON.stringify(rows));
      check('capture', 'save answers without waiting for the vector index (< 3 s)', c1ms < 3000, `${c1ms} ms, index ${c1b.index}`);
      let embedded = false;
      for (let i = 0; i < 15 && !embedded; i++) {
        const e = await j(await rest(jwtA, `memories?select=has_embedding&id=eq.${c1b.id}`));
        embedded = Array.isArray(e) && e[0]?.has_embedding === true;
        if (!embedded) await new Promise((r) => setTimeout(r, 2000));
      }
      check('capture', 'background indexing lands (memory gets its vector)', embedded, '');
      const prov = await j(await rest(jwtA, `memories?select=owner_id,capture_channel,source_application&id=eq.${c1b.id}`));
      check('capture', 'stored memory has owner + provenance', Array.isArray(prov) && prov[0]?.owner_id === a.id && prov[0]?.capture_channel === 'agent' && !!prov[0]?.source_application, JSON.stringify(prov));
      const d1 = await fn(a.apiKey, 'remember', { content: `A double send ${tokC}` }); const d1b = await j(d1);
      const d2 = await fn(a.apiKey, 'remember', { content: `  A double   send ${tokC} ` }); const d2b = await j(d2);
      check('capture', 'identical content within minutes (no key) is deduplicated', d1b.id && d2b.id === d1b.id && d2b.status === 'duplicate', `${d1b.id} / ${d2b.id} ${d2b.status}`);
      const bad = await fn(a.apiKey, 'remember', { content: '   ' }); const badb = await j(bad);
      check('capture', 'invalid capture is refused with stage + capture_id', bad.status === 400 && badb.code === 'invalid' && badb.stage === 'normalize' && !!badb.capture_id && badb.retryable === false, JSON.stringify(badb));
      const st = await j(await fn(a.apiKey, 'remember?status', null, 'GET'));
      const open = st?.needs_attention ?? [];
      check('capture', 'failures are visible in capture status', open.some((e) => e.id === badb.capture_id && e.status === 'failed') && open.some((e) => e.id === a.failedCaptureId), `${open.length} open`);
      check('capture', 'capture health reports attempts and success rate', (st?.health?.attempts ?? 0) >= 4 && st?.health?.success_rate != null, JSON.stringify(st?.health ?? null));
      const bst = await j(await fn(b.apiKey, 'remember?status', null, 'GET'));
      check('capture', "B's capture status contains none of A's captures", !has(bst, [badb.capture_id, c1b.capture_id, a.failedCaptureId]), '');
      const bRetry = await fn(b.apiKey, 'remember', { retry_capture_id: a.failedCaptureId }); const bRetryB = await j(bRetry);
      check('capture', "B cannot retry A's failed capture", bRetry.status === 404 && bRetryB.code === 'not_found', JSON.stringify(bRetryB));
      const mcpTool = async (key2, name, args) => { const r = await mcp(GATEWAY, key2, 'tools/call', { name, arguments: args }); const bj = await j(r);
        return { text: bj?.result?.content?.[0]?.text ?? JSON.stringify(bj), isError: !!bj?.result?.isError }; };
      const bMcp = await mcpTool(b.apiKey, 'retry_capture', { capture_id: a.failedCaptureId });
      check('capture', "B cannot retry A's failed capture over MCP", bMcp.isError && /no capture with that id/.test(bMcp.text), bMcp.text.slice(0, 120));
      const retry = await mcpTool(a.apiKey, 'retry_capture', { capture_id: a.failedCaptureId });
      const retriedId = (retry.text.match(/id: ([0-9a-f-]{36})/) ?? [])[1];
      check('capture', 'A retries the failed capture over MCP and it is stored', !retry.isError && !!retriedId, retry.text.slice(0, 160));
      const qrows = await j(await rest(jwtA, `memory_items?select=id&content=eq.${encodeURIComponent(a.queued)}`));
      check('capture', 'retried capture exists exactly once', Array.isArray(qrows) && qrows.length === 1 && qrows[0].id === retriedId, JSON.stringify(qrows));
      const again = await mcpTool(a.apiKey, 'retry_capture', { capture_id: a.failedCaptureId });
      check('capture', 'retrying a stored capture does not store it twice', !again.isError && /Already saved/.test(again.text), again.text.slice(0, 120));
      const m1 = await mcpTool(a.apiKey, 'remember', { content: `A via mcp ${tokC}`, idempotency_key: `mcp:${tokC}` });
      const m2 = await mcpTool(a.apiKey, 'capture', { content: `A via mcp ${tokC}`, idempotency_key: `mcp:${tokC}` });
      check('capture', 'MCP capture is idempotent on idempotency_key', !m1.isError && /Already saved/.test(m2.text), `${m1.text.slice(0, 60)} | ${m2.text.slice(0, 60)}`);
      const cs = await mcpTool(a.apiKey, 'capture_status', {});
      let csj = null; try { csj = JSON.parse(cs.text); } catch { /* */ }
      check('capture', 'capture_status over MCP returns health', !!csj?.health && typeof csj.health.attempts === 'number', cs.text.slice(0, 120));
    }

    // ── Public API v1 (A7-1), through the gateway ──
    {
      const v1 = (key, method, path, body) => fetch(`${GATEWAY}/v1${path}`, { method,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const g = await v1(a.apiKey, 'GET', `/memories/${bItem}`);
      check('api', "v1: A GETs B's memory → 404", g.status === 404, `status ${g.status}`);
      const rc = await v1(a.apiKey, 'POST', '/recall', { query: tokB });
      check('api', 'v1: A recall has no B data', rc.ok && !has(await j(rc), [contentB, titleB, bItem]), `status ${rc.status}`);
      for (const [verb, path] of [['POST', `/memories/${bItem}/retire`], ['DELETE', `/memories/${bItem}`], ['POST', `/memories/${bItem}/supersede`]]) {
        const r = await v1(a.apiKey, verb, path, verb === 'POST' ? { content: `A hijack ${tokA}` } : undefined);
        check('api', `v1: A ${verb} ${path.replace(bItem, '<B>')} → 404`, r.status === 404, `status ${r.status}`);
      }
      const own = await v1(b.apiKey, 'GET', `/memories/${bItem}`);
      check('control', 'v1: B still has its memory, active', own.ok && (await j(own)).state === 'active', `status ${own.status}`);
      const forged = await v1('axon_live_' + 'e'.repeat(48), 'GET', '/me');
      check('api', 'v1: forged token → 401', forged.status === 401, `status ${forged.status}`);
    }

    // ── /v1 with the app's own session JWT (A9-1): same tenant rules as a key ──
    {
      const DIRECT = `${URL_}/functions/v1/api-v1/v1`;
      const v1s = (jwt, method, path, body) => fetch(`${DIRECT}${path}`, { method,
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const me = await v1s(jwtA, 'GET', '/me');
      const meb = me.ok ? await j(me) : {};
      check('api', 'v1 session: /me acts as A with token kind session', me.ok && JSON.stringify(meb).includes(a.id) && JSON.stringify(meb).includes('session'), `status ${me.status}`);
      const g = await v1s(jwtA, 'GET', `/memories/${bItem}`);
      check('api', "v1 session: A's JWT GETs B's memory → 404", g.status === 404, `status ${g.status}`);
      const rc = await v1s(jwtA, 'POST', '/recall', { query: tokB });
      check('api', "v1 session: A's JWT recall has no B data", rc.ok && !has(await j(rc), [contentB, titleB, bItem]), `status ${rc.status}`);
      for (const [verb, path] of [['POST', `/memories/${bItem}/retire`], ['DELETE', `/memories/${bItem}`]]) {
        const r = await v1s(jwtA, verb, path, verb === 'POST' ? {} : undefined);
        check('api', `v1 session: A ${verb} ${path.replace(bItem, '<B>')} → 404`, r.status === 404, `status ${r.status}`);
      }
      const own = await v1s(jwtB, 'GET', `/memories/${bItem}`);
      check('control', "v1 session: B's JWT still reads its memory, active", own.ok && (await j(own)).state === 'active', `status ${own.status}`);
      const [h, p] = jwtA.split('.');
      const forgedJwt = `${h}.${p}.${'A'.repeat(43)}`;
      const fj = await v1s(forgedJwt, 'GET', '/me');
      check('api', 'v1 session: JWT with a forged signature → 401', fj.status === 401, `status ${fj.status}`);
      const cap = await v1s(jwtA, 'POST', '/memories', { content: `A app capture ${tokA}`, idempotency_key: `app:rls-${tokA}` });
      const capb = cap.ok ? await j(cap) : {};
      const ce = capb.capture_id ? await v1s(jwtA, 'GET', `/captures/${capb.capture_id}`) : null;
      const ceb = ce?.ok ? await j(ce) : {};
      const chan = ceb.channel ?? ceb.capture?.channel;
      check('control', 'v1 session: app capture is stored as direct, recorded on channel app', cap.status === 201 && capb.memory?.source?.channel === 'direct' && chan === 'app', `status ${cap.status} source ${capb.memory?.source?.channel} capture ${chan}`);
      if (capb.memory_id) await v1s(jwtA, 'DELETE', `/memories/${capb.memory_id}`);
    }

    // ── Connector runtime contract (A8-1) ──
    if (a.connectors) {
      const cx = a.connectors;
      const v1 = (key, path) => fetch(`${GATEWAY}/v1${path}`, { headers: { Authorization: `Bearer ${key}` } });
      const getList = async (jwt) => { const r = await fn(jwt, 'connectors', null, 'GET'); return { r, body: await j(r) }; };
      const { r: la, body: lab } = await getList(jwtA);
      const list = lab?.connectors ?? [];
      const byId = Object.fromEntries(list.map((c) => [c.id, c]));
      check('control', 'connectors: A lists own connections', la.ok && !!byId[cx.stuck] && !!byId[cx.unsupported] && !!byId[cx.gone], `status ${la.status} n=${list.length}`);
      check('connector', "connectors: A's list has no B connection", la.ok && !byId[cx.bConn] && !has(lab, [cx.bLabel]), `status ${la.status}`);
      check('connector', 'connectors: no token material in the contract', !JSON.stringify(lab).includes(cx.secret) && !/access_token_encrypted|refresh_token_encrypted/.test(JSON.stringify(lab)));
      const st = byId[cx.stuck] ?? {};
      check('connector', 'stuck sync is not reported as synchronized', st.health === 'stuck' && st.synchronized === false, `${st.health}/${st.synchronized}`);
      check('connector', 'failure visible: error kind, streak, last success kept', st.error?.kind === 'auth' && st.consecutive_failures === 2 && !!st.last_success_at && !!st.last_attempt_at, JSON.stringify(st.error));
      check('connector', 'imported count and last run reported', st.imported?.items === 1 && st.imported?.last_run?.fetched === 5 && st.imported?.last_run?.stored === 1, JSON.stringify(st.imported));
      check('connector', 'scope explanation + revoke + provenance present', st.scope?.access === 'read-only' && !!st.scope?.explanation && st.revoke?.available === true && st.provenance?.connection_id === cx.stuck);
      const un = byId[cx.unsupported] ?? {};
      check('connector', 'unsupported provider is honest (unsupported, not synchronized)', un.health === 'unsupported' && un.supported === false && un.synchronized === false, `${un.health}`);
      const gone = byId[cx.gone] ?? {};
      check('connector', 'disconnected connector shows disconnected, revoke unavailable', gone.health === 'disconnected' && gone.revoke?.available === false && gone.synchronized === false, `${gone.health}`);
      check('control', 'catalog lists unsupported providers as unsupported', (lab?.catalog ?? []).some((c) => c.provider === 'discord' && c.supported === false));

      const v1l = await v1(a.apiKey, '/connectors');
      const v1b = await j(v1l);
      check('control', 'v1: GET /connectors returns the same contract', v1l.ok && (v1b.connectors ?? []).some((c) => c.id === cx.stuck && c.health === 'stuck'), `status ${v1l.status}`);
      check('connector', "v1: A's /connectors has no B connection", v1l.ok && !has(v1b, [cx.bConn, cx.bLabel]));
      const v1x = await v1(a.apiKey, `/connectors/${cx.bConn}`);
      check('connector', "v1: A GET /connectors/<B> → 404", v1x.status === 404, `status ${v1x.status}`);
      const v1ro = await v1(a.readOnlyKey, `/connectors/${cx.stuck}`);
      check('control', 'v1: read-only key can read a connector', v1ro.ok, `status ${v1ro.status}`);

      const bOne = await fn(jwtB, `connectors?id=${cx.stuck}`, null, 'GET');
      check('connector', "B GET connectors?id=<A's> → 404", bOne.status === 404, `status ${bOne.status}`);
      const bDis = await fn(jwtB, 'disconnect-source', { source_connection_id: cx.stuck });
      check('connector', "B cannot revoke A's connector (404)", bDis.status === 404, `status ${bDis.status}`);
      const bSync = await fn(jwtB, 'sync-source', { source_connection_id: cx.stuck });
      check('connector', "B cannot sync A's connector (404)", bSync.status === 404, `status ${bSync.status}`);
      const aGoneSync = await fn(jwtA, 'sync-source', { source_connection_id: cx.gone });
      check('connector', 'syncing a disconnected connector is refused (409), not turned into "failing"', aGoneSync.status === 409, `status ${aGoneSync.status}`);
      const aRev = await fn(jwtA, 'disconnect-source', { source_connection_id: cx.unsupported });
      const aRevB = await j(aRev);
      check('connector', 'revoke: tokens deleted, provider revoke not claimed when not done', aRev.ok && aRevB.tokens_deleted === true && aRevB.revoked_at_provider === false && aRevB.imported_memories_kept === true, JSON.stringify(aRevB).slice(0, 160));
      const after = await getList(jwtA);
      const afterById = Object.fromEntries((after.body?.connectors ?? []).map((c) => [c.id, c]));
      check('connector', 'after revoke the connector reads disconnected', afterById[cx.unsupported]?.health === 'disconnected', afterById[cx.unsupported]?.health);
      check('connector', "A's other connector untouched by B's revoke attempt", afterById[cx.stuck]?.health === 'stuck' && afterById[cx.stuck]?.status === 'syncing', afterById[cx.stuck]?.status);
      const { body: lbb } = await getList(jwtB);
      check('control', 'B lists its own connector and none of A\'s', (lbb?.connectors ?? []).some((c) => c.id === cx.bConn) && !has(lbb, [cx.label, cx.stuck]));
    }

    // ── MCP OAuth (A5-4 PKCE S256-only, A5-5 expiry + refresh, grandfathering) ──
    if (a.oauth) {
      const o = a.oauth;
      const form = (params) => fetch(`${GATEWAY}/token`, { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
      const meta = await j(await fetch(`${GATEWAY}/.well-known/oauth-authorization-server`));
      check('oauth', 'metadata advertises PKCE S256 only', JSON.stringify(meta.code_challenge_methods_supported) === '["S256"]', JSON.stringify(meta.code_challenge_methods_supported));
      check('oauth', 'metadata advertises refresh_token grant', (meta.grant_types_supported ?? []).includes('refresh_token'));
      const authz = (extra) => fetch(`${GATEWAY}/authorize?${new URLSearchParams({ client_id: o.clientId, redirect_uri: o.redirectUri, response_type: 'code', state: 'st', ...extra })}`, { redirect: 'manual' });
      const loc = (r) => r.headers.get('location') ?? '';
      const goodCh = createHash('sha256').update(randomBytes(16)).digest('base64url');
      const rPlain = await authz({ code_challenge: 'x'.repeat(43), code_challenge_method: 'plain' });
      check('oauth', '/authorize refuses code_challenge_method=plain (error back to client)', rPlain.status === 302 && loc(rPlain).startsWith(o.redirectUri) && /error=invalid_request/.test(loc(rPlain)) && /state=st/.test(loc(rPlain)), `${rPlain.status} ${loc(rPlain).slice(0, 90)}`);
      const rNone = await authz({});
      check('oauth', '/authorize refuses a public client without PKCE', rNone.status === 302 && /error=invalid_request/.test(loc(rNone)), `${rNone.status}`);
      const rOk = await authz({ code_challenge: goodCh, code_challenge_method: 'S256' });
      check('control', '/authorize with S256 goes to the consent screen', rOk.status === 302 && /\/connect\/authorize\?/.test(loc(rOk)) && /code_challenge_method=S256/.test(loc(rOk)), `${rOk.status} ${loc(rOk).slice(0, 60)}`);
      const cPlain = await fn(jwtA, 'mcp-oauth-consent', { client_id: o.clientId, redirect_uri: o.redirectUri, code_challenge: 'y'.repeat(43), code_challenge_method: 'plain', decision: 'approve' });
      check('oauth', 'consent refuses plain before minting a code', cPlain.status === 400, `status ${cPlain.status}`);
      // decision 'describe' (consent screen, axon-memory-app PR #2): the server names the client from
      // its registered row + redirect host, never from the link. A stranger's client is unverified.
      const dOk = await fn(jwtA, 'mcp-oauth-consent', { client_id: o.clientId, redirect_uri: o.redirectUri, code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', client_name: 'Claude', decision: 'describe' });
      const dBody = await j(dOk);
      check('oauth', 'describe names the client by its redirect host, not the link', dOk.ok && dBody.client?.host === 'rls-test.invalid' && dBody.client?.verified === false && dBody.client?.slug === null && dBody.client?.name === 'rls-test.invalid', `status ${dOk.status} ${JSON.stringify(dBody.client ?? dBody).slice(0, 120)}`);
      check('oauth', 'describe mints no code', !('redirect_to' in dBody) && !JSON.stringify(dBody).includes('code='), JSON.stringify(dBody).slice(0, 80));
      const dBad = await fn(jwtA, 'mcp-oauth-consent', { client_id: o.clientId, redirect_uri: 'https://evil.example/cb', code_challenge: 'x'.repeat(43), decision: 'describe' });
      check('oauth', 'describe refuses an unregistered redirect_uri', dBad.status === 400, `status ${dBad.status}`);
      const dPlain = await fn(jwtA, 'mcp-oauth-consent', { client_id: o.clientId, redirect_uri: o.redirectUri, code_challenge: 'y'.repeat(43), code_challenge_method: 'plain', decision: 'describe' });
      check('oauth', 'describe refuses plain PKCE too', dPlain.status === 400, `status ${dPlain.status}`);
      const dAnon = await fetch(`${URL_}/functions/v1/mcp-oauth-consent`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: o.clientId, redirect_uri: o.redirectUri, decision: 'describe' }) });
      check('oauth', 'describe needs a signed-in user', dAnon.status === 401, `status ${dAnon.status}`);

      const tPlain = await form({ grant_type: 'authorization_code', code: o.plainCode, redirect_uri: o.redirectUri, client_id: o.clientId, code_verifier: o.plainVerifier });
      check('oauth', 'token endpoint refuses a stored plain-PKCE code', tPlain.status === 400 && (await j(tPlain)).error === 'invalid_grant', `status ${tPlain.status}`);
      const tWrong = await form({ grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri, client_id: o.clientId, code_verifier: 'wrong-' + o.verifier });
      check('oauth', 'token endpoint refuses a wrong S256 verifier', tWrong.status === 400, `status ${tWrong.status}`);
      const tOk = await form({ grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri, client_id: o.clientId, code_verifier: o.verifier });
      const tok = await j(tOk);
      check('oauth', 'S256 code → access + refresh token with expires_in', tOk.ok && /^axon_live_/.test(tok.access_token ?? '') && /^axon_refresh_/.test(tok.refresh_token ?? '') && tok.expires_in > 0, `status ${tOk.status} expires_in ${tok.expires_in}`);
      const tReplay = await form({ grant_type: 'authorization_code', code: o.code, redirect_uri: o.redirectUri, client_id: o.clientId, code_verifier: o.verifier });
      check('oauth', 'a code cannot be redeemed twice', tReplay.status === 400, `status ${tReplay.status}`);

      const ok1 = await mcp(GATEWAY, tok.access_token, 'tools/call', { name: 'recall_context', arguments: { query: tokA } });
      const ok1b = await j(ok1);
      check('oauth', 'new OAuth token recalls only its own user', ok1.ok && has(ok1b, [contentA]) && !has(ok1b, [contentB, titleB]), `status ${ok1.status}`);
      const rWrongClient = await form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: 'axon-claude-mcp' });
      check('oauth', 'refresh token is bound to its client', rWrongClient.status >= 400, `status ${rWrongClient.status}`);
      const rf = await form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: o.clientId });
      const tok2 = await j(rf);
      check('oauth', 'refresh_token grant rotates access + refresh', rf.ok && tok2.access_token && tok2.access_token !== tok.access_token && tok2.refresh_token !== tok.refresh_token, `status ${rf.status}`);
      const reuse = await form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: o.clientId });
      check('oauth', 'a rotated refresh token cannot be reused', reuse.status === 400, `status ${reuse.status}`);
      const oldAcc = await mcp(GATEWAY, tok.access_token, 'tools/list', {});
      check('oauth', 'the pre-refresh access token stops working', oldAcc.status === 401, `status ${oldAcc.status}`);
      const newAcc = await mcp(GATEWAY, tok2.access_token, 'tools/list', {});
      check('control', 'the refreshed access token works', newAcc.ok, `status ${newAcc.status}`);
      const legacy = await mcp(GATEWAY, o.legacyKey, 'tools/list', {});
      check('control', 'grandfathered OAuth token (no expiry) keeps working', legacy.ok, `status ${legacy.status}`);
      const expired = await mcp(GATEWAY, o.expiredKey, 'tools/list', {});
      check('oauth', 'expired OAuth token → 401 invalid_token', expired.status === 401 && /invalid_token/.test(expired.headers.get('www-authenticate') ?? ''), `${expired.status} ${expired.headers.get('www-authenticate')}`);
      const expRest = await fn(o.expiredKey, 'context-pack', { query: tokA });
      check('oauth', 'expired OAuth token refused by context-pack too', expRest.status === 401, `status ${expRest.status}`);
      const bRefresh = await form({ grant_type: 'refresh_token', refresh_token: 'axon_refresh_' + '0'.repeat(64), client_id: o.clientId });
      check('oauth', 'forged refresh token refused', bRefresh.status === 400, `status ${bRefresh.status}`);
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
