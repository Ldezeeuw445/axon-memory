// Cold signed-in load of Recall in a mobile profile with network + CPU throttling.
// Usage: FIX=throwaway-user.json B=https://app.axon-memory.com NET=fast4g|slow4g|none RUNS=3 npm run perf:recall
// Signs a throwaway user in once, then times cold loads of /?facet=recall with the stored session.
const { chromium } = await import(`${process.env.PW_DIR || '/tmp/pw'}/node_modules/playwright-core/index.mjs`);
import fs from 'fs';
const fx = JSON.parse(fs.readFileSync(process.env.FIX || '/workspace/perf-fixture.json'));
const B = process.env.B || 'http://localhost:4173';
const NETS = { fast4g: { latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }, slow4g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 } };
const net = NETS[process.env.NET || 'fast4g'];
const CPU = Number(process.env.CPU || 4);
const RUNS = Number(process.env.RUNS || 3);
const VERBOSE = !!process.env.VERBOSE;
const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
// Sign in once, keep only the stored session (as a returning person has).
const ctx0 = await br.newContext({ viewport: { width: 390, height: 844 } });
const p0 = await ctx0.newPage();
await p0.goto(`${B}/login`);
await p0.fill('input[type="email"]', fx.email); await p0.fill('input[type="password"]', fx.password);
await p0.click('button[type="submit"]');
await p0.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')), null, { timeout: 30000 });
const state = await ctx0.storageState();
await ctx0.close();
const results = [];
for (let r = 0; r < RUNS; r++) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: state,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net });
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const t0 = Date.now();
  const ev = [];
  let bytes = 0;
  page.on('request', (q) => { const u = q.url(); if (/rest\/v1|auth\/v1|functions\/v1/.test(u)) ev.push([Date.now() - t0, 'req', u.split('?')[0].replace(/^.*\/(rest|auth|functions)\/v1\//, '$1:')]); });
  page.on('response', async (s) => { const l = Number((await s.headerValue('content-length').catch(() => 0)) || 0); bytes += l; });
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) ev.push([Date.now() - t0, 'console', m.text().slice(0, 160)]); });
  await page.goto(`${B}/?facet=recall`, { waitUntil: 'commit' });
  const marks = {};
  const wait = async (name, sel) => { try { await page.waitForSelector(sel, { timeout: 30000 }); marks[name] = Date.now() - t0; } catch { marks[name] = null; } };
  await Promise.all([
    wait('shell', 'nav[aria-label="Facets"]'),
    wait('recallInput', 'input[aria-label="Recall"]'),
    wait('recallHome', '.ax-young, .ax-section-label'),
    (async () => { try { await page.waitForFunction(() => { const el = document.querySelector('.ax-young, .ax-section-label'); if (!el) return false; let n = el; while (n) { if (Number(getComputedStyle(n).opacity) < 0.95) return false; n = n.parentElement; } return true; }, null, { timeout: 30000, polling: 50 }); marks.recallVisible = Date.now() - t0; } catch { marks.recallVisible = null; } })(),
  ]);
  const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)])));
  const firstRest = ev.find((e) => e[1] === 'req' && e[2].startsWith('rest:'));
  results.push({ run: r + 1, ...marks, fcp: paint['first-contentful-paint'] ?? null, firstRest: firstRest ? firstRest[0] : null });
  if (VERBOSE && r === 0) for (const e of ev) console.log('  ', ...e);
  await ctx.close();
}
await br.close();
const med = (k) => { const v = results.map((x) => x[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log(JSON.stringify({ base: B, net: process.env.NET || 'fast4g', cpu: CPU, runs: results, median: { fcp: med('fcp'), shell: med('shell'), recallInput: med('recallInput'), firstRest: med('firstRest'), recallHome: med('recallHome'), recallVisible: med('recallVisible') } }, null, 1));
