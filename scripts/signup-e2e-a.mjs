// §37 step 1, phase A: sign up through the real app (mobile profile). Password is read from /tmp/e2e_pw (random, never committed).
// Then read the confirmation mail in the test inbox and pass its link to signup-e2e-b.mjs.
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
const pw = fs.readFileSync('/tmp/e2e_pw','utf8').trim();
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const t0 = Date.now();
await p.goto('https://app.axon-memory.com/login?mode=signup', { waitUntil: 'networkidle' });
await p.fill('input[placeholder="Full name"]', 'AXON Test');
await p.fill('input[type=email]', 'axon-test@mail.grokbot.com');
await p.fill('input[placeholder="Password"]', pw);
await p.screenshot({ path: '/tmp/a1-form.png' });
const resp = p.waitForResponse(r => r.url().includes('/auth/v1/signup'), { timeout: 20000 });
await p.click('button[type=submit]');
const r = await resp; console.log('signup status', r.status());
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/a2-after.png' });
console.log('page text:', (await p.locator('body').innerText()).slice(0, 600).replace(/\n+/g,' | '));
console.log('elapsed ms', Date.now()-t0, 'at', new Date().toISOString());
await b.close();
