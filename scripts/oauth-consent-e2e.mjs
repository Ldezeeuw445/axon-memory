#!/usr/bin/env node
/**
 * Spec §37 step 4 — "Another AI connects through AXON MCP", end to end in a
 * real browser against production:
 *
 *   DCR register → gateway /authorize (S256) → app login → consent screen →
 *   click Approve → code at the client's redirect → /token → MCP tools/list +
 *   recall → refresh rotation → the AI is listed in Connect → Withdraw in the
 *   app → its token stops working. Then Cancel on a second consent → the
 *   client gets error=access_denied.
 *
 * Needs a throwaway user that may connect AIs (plan with axon_ai):
 *   E2E_FIXTURE=/path/{email,password,id}.json SUPABASE_ANON_KEY=… node scripts/oauth-consent-e2e.mjs
 * Optional: PW_DIR (dir with playwright-core, default /tmp/pw), CHROME, SHOTS_DIR.
 * The client is named "rls-test e2e …" with redirect https://rls-test.invalid/cb,
 * so tests/rls/cleanup-http-fixtures.sql removes it with the user.
 */
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';

const require = createRequire(`${process.env.PW_DIR ?? '/tmp/pw'}/`);
const { chromium } = require('playwright-core');
const fx = JSON.parse(readFileSync(process.env.E2E_FIXTURE, 'utf8'));
const APP = process.env.APP_URL_E2E ?? 'https://app.axon-memory.com';
const GATEWAY = process.env.MCP_GATEWAY_URL ?? 'https://mcp.axon-memory.com';
const SUPA = process.env.SUPABASE_URL ?? 'https://ktaditgtbubonrahyiig.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY;
const SHOTS = process.env.SHOTS_DIR ?? '/workspace/axon-shots/a12';
const REDIRECT = 'https://rls-test.invalid/cb';
mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { ok ? passed++ : failed++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const form = (params) => fetch(`${GATEWAY}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
let rpc = 1;
const mcp = (key, method, params = {}) => fetch(GATEWAY, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: rpc++, method, params }) });
const body = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { const m = t.match(/data: (\{.*\})/); return m ? JSON.parse(m[1]) : t; } };

// 1. Dynamic client registration, as Claude/ChatGPT do it.
const tag = randomBytes(4).toString('hex');
const reg = await fetch(`${GATEWAY}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: `rls-test e2e ${tag}`, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }) });
const client = await body(reg);
check('DCR: client registered through the public gateway', reg.status === 201 || reg.ok, `status ${reg.status}`);
const clientId = client.client_id;

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
let landed = null;
await page.route('https://rls-test.invalid/**', (route) => { landed = route.request().url(); return route.fulfill({ status: 200, contentType: 'text/plain', body: 'client received the redirect' }); });

const authorize = async (state) => {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, response_type: 'code', state, scope: 'memory.read memory.write', code_challenge: challenge, code_challenge_method: 'S256' });
  landed = null;
  await page.goto(`${GATEWAY}/authorize?${q}`);
  return verifier;
};

try {
  // 2. The AI sends the person to /authorize; they are not signed in yet.
  const state1 = `st-${tag}-1`;
  const verifier = await authorize(state1);
  await page.waitForURL(/\/login/, { timeout: 20000 });
  check('unsigned person is sent to sign in first', /\/login/.test(page.url()));
  await page.fill('input[type="email"]', fx.email);
  await page.fill('input[type="password"]', fx.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/connect\/authorize/, { timeout: 30000 });
  check('after sign-in the person returns to the consent screen', /\/connect\/authorize\?/.test(page.url()));

  // 3. The consent screen names the client from the server, then Approve.
  const approve = page.getByRole('button', { name: /^Approve for / });
  await approve.waitFor({ timeout: 20000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^Approve for /.test(b.textContent) && !b.disabled), null, { timeout: 20000 });
  const label = (await approve.textContent()).trim();
  check('consent names the client by its redirect host, not its self-chosen name', /rls-test\.invalid/.test(label) && !/rls-test e2e/.test(label), label);
  check('consent warns that the app is not verified', await page.getByText(/has not verified this app/).isVisible());
  await page.screenshot({ path: `${SHOTS}/consent-mobile.png` });
  await approve.click();
  for (let i = 0; i < 60 && !landed; i++) await page.waitForTimeout(250);
  const back = landed ? new URL(landed) : null;
  check('Approve sends a code and the same state back to the client', !!back && !!back.searchParams.get('code') && back.searchParams.get('state') === state1, landed?.replace(/code=[^&]+/, 'code=…'));

  // 4. The client finishes the dance and uses MCP.
  const t = await form({ grant_type: 'authorization_code', code: back?.searchParams.get('code') ?? '', redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
  const tok = await body(t);
  check('code + verifier → access and refresh token', t.ok && /^axon_live_/.test(tok.access_token ?? '') && /^axon_refresh_/.test(tok.refresh_token ?? ''), `status ${t.status}`);
  const list = await body(await mcp(tok.access_token, 'tools/list'));
  check('MCP tools/list works with the new token', Array.isArray(list?.result?.tools) && list.result.tools.some((x) => x.name === 'recall_context'), `${list?.result?.tools?.length ?? 0} tools`);
  const rc = await mcp(tok.access_token, 'tools/call', { name: 'recall_context', arguments: { query: 'anything' } });
  check('MCP recall_context answers for this user', rc.ok, `status ${rc.status}`);
  const rf = await form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId });
  const tok2 = await body(rf);
  check('refresh rotates the token', rf.ok && tok2.access_token && tok2.access_token !== tok.access_token, `status ${rf.status}`);
  const live = tok2.access_token ?? tok.access_token;

  // 5. The person sees the AI in Connect and withdraws it there.
  await page.goto(`${APP}/?facet=connections`);
  const row = page.locator('.ax-row', { hasText: /rls-test/ }).first();
  await row.waitFor({ timeout: 20000 }).catch(() => {});
  check('the new AI is listed under "AIs that can read your memory"', await row.isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/connect-ai-listed-mobile.png` });
  await row.getByRole('button', { name: 'Withdraw' }).click().catch(() => {});
  await page.getByText(/can no longer read your memory/).waitFor({ timeout: 15000 }).catch(() => {});
  const after = await mcp(live, 'tools/list');
  check('after Withdraw in the app, the AI\'s token is refused (401)', after.status === 401, `status ${after.status}`);

  // 6. A second consent, cancelled.
  const state2 = `st-${tag}-2`;
  await authorize(state2);
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await cancel.waitFor({ timeout: 20000 });
  await cancel.click();
  for (let i = 0; i < 60 && !landed; i++) await page.waitForTimeout(250);
  const denied = landed ? new URL(landed) : null;
  check('Cancel sends error=access_denied with the state and no code', !!denied && denied.searchParams.get('error') === 'access_denied' && denied.searchParams.get('state') === state2 && !denied.searchParams.get('code'), landed ?? 'no redirect');

  // 7. Nothing usable was left behind: the user's keys for this client are all withdrawn.
  await page.goto(`${APP}/?facet=connections`);
  const session = JSON.parse(await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith('-auth-token')))));
  const keys = await body(await fetch(`${SUPA}/rest/v1/api_keys?select=id,revoked_at&oauth_client_id=eq.${clientId}`, { headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}` } }));
  check('every key minted for this client is withdrawn', Array.isArray(keys) && keys.length >= 1 && keys.every((k) => k.revoked_at), `${Array.isArray(keys) ? keys.length : keys} keys`);
} catch (err) {
  check('flow completed without an exception', false, String(err?.message ?? err).slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/consent-e2e-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
