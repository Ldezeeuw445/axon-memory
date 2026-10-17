// §37 step 1, phase B: follow the confirmation link, first sign-in in a fresh browser, delete the account from You,
// and prove the password no longer signs in. Usage: node scripts/signup-e2e-b.mjs '<confirmation link>'
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
const link = process.argv[2];
const pw = fs.readFileSync('/tmp/e2e_pw','utf8').trim();
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mk = async () => (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const txt = async (p) => (await p.locator('body').innerText()).slice(0, 500).replace(/\n+/g, ' | ');
// 1. follow the confirmation link
let p = await mk();
await p.goto(link, { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
console.log('after confirm url:', p.url().replace(/access_token=[^&]+/, 'access_token=…').replace(/refresh_token=[^&]+/, 'refresh_token=…').slice(0, 160));
console.log('after confirm text:', await txt(p));
await p.screenshot({ path: '/tmp/b1-confirmed.png' });
await p.context().close();
// 2. first sign-in in a fresh browser
p = await mk();
const t0 = Date.now();
await p.goto('https://app.axon-memory.com/login', { waitUntil: 'networkidle' });
await p.fill('input[type=email]', 'axon-test@mail.grokbot.com');
await p.fill('input[placeholder="Password"]', pw);
const tok = p.waitForResponse(r => r.url().includes('/auth/v1/token'), { timeout: 20000 });
await p.click('button[type=submit]');
console.log('token status', (await tok).status());
await p.waitForTimeout(4000);
console.log('signed-in url:', p.url(), 'ms', Date.now() - t0);
console.log('signed-in text:', await txt(p));
await p.screenshot({ path: '/tmp/b2-first-signin.png' });
// 3. delete the account from You
await p.goto('https://app.axon-memory.com/?facet=you', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/b3-you.png' });
await p.locator('summary', { hasText: 'Delete your account' }).click();
await p.fill('input[aria-label="Type DELETE to confirm"]', 'DELETE');
const del = p.waitForResponse(r => r.url().includes('/functions/v1/delete-account'), { timeout: 30000 });
await p.locator('button', { hasText: /^Delete$/ }).click();
const dr = await del; console.log('delete-account status', dr.status());
await p.waitForTimeout(3000);
console.log('after delete url:', p.url());
await p.screenshot({ path: '/tmp/b4-after-delete.png' });
// 4. the old password no longer signs in
const p2 = await mk();
await p2.goto('https://app.axon-memory.com/login', { waitUntil: 'networkidle' });
await p2.fill('input[type=email]', 'axon-test@mail.grokbot.com');
await p2.fill('input[placeholder="Password"]', pw);
const tok2 = p2.waitForResponse(r => r.url().includes('/auth/v1/token'), { timeout: 20000 });
await p2.click('button[type=submit]');
console.log('sign-in after delete status', (await tok2).status());
await p2.waitForTimeout(1500);
console.log('after-delete login text:', await txt(p2));
await b.close();
