// First sign-in, timed from the Sign In tap to a usable Recall, in a mobile profile
// with network + CPU throttling. The login page itself is loaded (and settled) first;
// that load is reported separately as `loginReady`.
// Usage: FIX=throwaway-user.json B=https://app.axon-memory.com NET=fast4g|slow4g RUNS=3 node scripts/perf-signin.mjs
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
const results = [];
for (let r = 0; r < RUNS; r++) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {} });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net });
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const l0 = Date.now();
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  const loginReady = Date.now() - l0;
  await page.fill('input[type="email"]', fx.email); await page.fill('input[type="password"]', fx.password);
  const ev = [];
  let t0 = 0;
  page.on('request', (q) => { const u = q.url(); if (t0 && /rest\/v1|auth\/v1|functions\/v1|\.js$/.test(u.split('?')[0])) ev.push([Date.now() - t0, 'req', u.split('?')[0].replace(/^.*\/(rest|auth|functions)\/v1\//, '$1:').replace(/^.*\/assets\//, 'js:')]); });
  page.on('response', (s) => { const u = s.url(); if (t0 && /rest\/v1|auth\/v1/.test(u)) ev.push([Date.now() - t0, 'res', u.split('?')[0].replace(/^.*\/(rest|auth)\/v1\//, '$1:'), s.status()]); });
  t0 = Date.now();
  await page.click('button[type="submit"]');
  const marks = {};
  const wait = async (name, sel) => { try { await page.waitForSelector(sel, { timeout: 30000 }); marks[name] = Date.now() - t0; } catch { marks[name] = null; } };
  await Promise.all([
    wait('recallInput', 'input[aria-label="Recall"]'),
    (async () => { try { await page.waitForFunction(() => { const el = document.querySelector('.ax-young, .ax-section-label'); if (!el) return false; let n = el; while (n) { if (Number(getComputedStyle(n).opacity) < 0.95) return false; n = n.parentElement; } return true; }, null, { timeout: 30000, polling: 50 }); marks.recallVisible = Date.now() - t0; } catch { marks.recallVisible = null; } })(),
  ]);
  // Main-thread time lost to long tasks in the 5 s after the tap (a frozen phone feels slow even once Recall shows).
  const tapAt = await page.evaluate(() => performance.now()) - (Date.now() - t0);
  await page.waitForTimeout(Math.max(0, 5000 - (Date.now() - t0)));
  const blocked = Math.round(await page.evaluate((a) => window.__lt.filter(([s]) => s >= a).reduce((n, [, d]) => n + d, 0), tapAt));
  const tok = ev.find((e) => e[1] === 'res' && e[2].startsWith('auth:token'));
  results.push({ run: r + 1, loginReady, token: tok ? tok[0] : null, ...marks, blocked5s: blocked });
  if (VERBOSE && r === 0) for (const e of ev) console.log('  ', ...e);
  await ctx.close();
}
await br.close();
const med = (k) => { const v = results.map((x) => x[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log(JSON.stringify({ base: B, net: process.env.NET || 'fast4g', cpu: CPU, runs: results, median: { loginReady: med('loginReady'), token: med('token'), recallInput: med('recallInput'), recallVisible: med('recallVisible'), blocked5s: med('blocked5s') } }, null, 1));
