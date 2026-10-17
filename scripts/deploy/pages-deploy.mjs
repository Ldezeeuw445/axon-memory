#!/usr/bin/env node
/**
 * Pages Direct Upload, deployment phase (after pages-upload.mjs).
 *
 *   node scripts/deploy/pages-deploy.mjs <project> <sha> "<message>"
 *
 * With CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set it creates the
 * production deployment itself. Without them it writes the equivalent
 * `cloudflare.request` code to .pages-deploy-<project>.js, for running through
 * the Cloudflare MCP `execute` tool (how the bot deploys; no token on disk).
 * One project per call: each site is deployed and smoke-tested on its own.
 */
import fs from 'node:fs';
const [project, sha, message = ''] = process.argv.slice(2);
if (!project || !sha) { console.error('usage: pages-deploy.mjs <project> <sha> "<message>"'); process.exit(2); }
if (!['axon-app', 'axon-memory'].includes(project)) { console.error(`unknown project ${project}`); process.exit(2); }
const manifestPath = process.env.MANIFEST || '.pages-manifest.json';
if (!fs.existsSync(manifestPath)) { console.error(`${manifestPath} missing: run pages-upload.mjs first`); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fields = { manifest: JSON.stringify(manifest), branch: 'main', commit_hash: sha, commit_message: message, commit_dirty: 'false' };

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (token && account) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json();
  if (!data.success) { console.error(JSON.stringify(data.errors)); process.exit(1); }
  console.log(JSON.stringify({ project, id: data.result.id, url: data.result.url, stage: data.result.latest_stage?.name }));
} else {
  const code = `async () => {
  const fields = ${JSON.stringify(fields)};
  const b = 'F' + Date.now();
  const parts = [];
  for (const [n, v] of Object.entries(fields)) parts.push('--' + b, 'Content-Disposition: form-data; name="' + n + '"', '', v);
  const body = parts.concat(['--' + b + '--', '']).join('\\r\\n');
  const r = await cloudflare.request({ method: 'POST', path: '/accounts/' + accountId + '/pages/projects/${project}/deployments', body, contentType: 'multipart/form-data; boundary=' + b, rawBody: true });
  return r.success ? { id: r.result.id, url: r.result.url, stage: r.result.latest_stage } : r.errors;
}
`;
  const out = `.pages-deploy-${project}.js`;
  fs.writeFileSync(out, code);
  console.log(`wrote ${out} (${Object.keys(manifest).length} files) — run it with the Cloudflare MCP execute tool`);
}
