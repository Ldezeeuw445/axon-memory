#!/usr/bin/env node
// End-to-end smoke test against a REAL deployed Supabase project. This is
// the exact disposable-test-account lifecycle used to hand-verify every
// change during initial development (create user -> real login -> exercise
// real edge functions -> assert on real responses -> full cleanup -> assert
// zero residue) — turned into a script so it can run in CI or on demand
// instead of being re-typed by hand.
//
// Deliberately hits the live project, not a local stack: this codebase has
// no local Supabase stack configured, and "does the deployed thing actually
// work" is the question that matters — a passing unit test suite doesn't
// answer it, this does.
//
// Required env vars (never hardcode these — pass via CI secrets or your shell):
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Usage: node scripts/smoke-test.mjs
// Exit code 0 = all checks passed. Exit code 1 = something is broken.

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('smoke-test: missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars.');
  console.error('This test hits a real project on purpose — set these to run it, or skip it in CI if secrets are unavailable.');
  process.exit(1);
}

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail });
  console.log(`${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const testEmail = `smoke-test-${Date.now()}@example.com`;
  const testPassword = 'Sm0keTest!' + Math.random().toString(36).slice(2);
  let userId = null;
  let jwt = null;

  try {
    // 1. Create a disposable auth user (service role — bypasses email confirmation).
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, email_confirm: true }),
    });
    const created = await createRes.json();
    check('create disposable test user', createRes.ok && created.id, `status ${createRes.status}`);
    userId = created.id;

    // 2. Log in for real — get a genuine session JWT, not a fabricated one.
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const login = await loginRes.json();
    check('real password login', loginRes.ok && login.access_token, `status ${loginRes.status}`);
    jwt = login.access_token;

    // 3. Write a memory via the `remember` REST path... but remember expects
    // an Axon Bearer token, not a Supabase JWT — mcp-server / context-pack
    // are the JWT-authenticated paths used by the SPA. Exercise context-pack
    // directly (buildContextPack), which is what the dashboard relies on,
    // and which itself will attempt an embedding + fall back to keyword
    // search — proving the whole read path is alive end-to-end.
    const cpRes = await fetch(`${SUPABASE_URL}/functions/v1/context-pack`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const cpBody = await cpRes.json();
    check('context-pack responds for a fresh user', cpRes.ok && cpBody.profile !== undefined, `status ${cpRes.status}`);

    // 4. Write a real memory item directly (service role — same row shape
    // rememberMemory() would produce) and confirm it round-trips back
    // through context-pack, proving the read path actually sees new writes.
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/memory_items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId, source_type: 'manual', content_type: 'note',
        title: 'Smoke test memory', content: 'This is a disposable smoke-test memory item.',
        occurred_at: new Date().toISOString(),
      }),
    });
    const inserted = await insertRes.json();
    check('insert a test memory item', insertRes.ok && inserted?.[0]?.id, `status ${insertRes.status}`);

    const cp2Res = await fetch(`${SUPABASE_URL}/functions/v1/context-pack`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const cp2Body = await cp2Res.json();
    const allTitles = Object.values(cp2Body.memory ?? {}).flat().map((m) => m.title);
    check('written memory appears in context-pack', allTitles.includes('Smoke test memory'), `titles seen: ${JSON.stringify(allTitles)}`);

    // 5. Delete the account via the real delete-account function (not a
    // raw DB delete) — proves the cascade-delete + the function itself work.
    const delAcctRes = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    check('delete-account function succeeds', delAcctRes.ok, `status ${delAcctRes.status}`);
    userId = null; // already deleted, skip the fallback cleanup below

    // 6. Confirm zero residue: no profile row, no memory_items row for this user.
    const residueRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${created.id}&select=id`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } },
    );
    const residue = await residueRes.json();
    check('no profile row left behind after delete-account', Array.isArray(residue) && residue.length === 0, `found ${residue?.length ?? '?'} rows`);

    const memResidueRes = await fetch(
      `${SUPABASE_URL}/rest/v1/memory_items?user_id=eq.${created.id}&select=id`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } },
    );
    const memResidue = await memResidueRes.json();
    check('no memory_items rows left behind after delete-account', Array.isArray(memResidue) && memResidue.length === 0, `found ${memResidue?.length ?? '?'} rows`);
  } finally {
    // Fallback cleanup in case something failed before delete-account ran —
    // never leave a real (even if disposable) auth user behind on a failed run.
    if (userId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      }).catch(() => {});
      console.log('(fallback cleanup: deleted leftover test user)');
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke-test: unhandled error', err);
  process.exit(1);
});
