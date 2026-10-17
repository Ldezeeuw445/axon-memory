#!/usr/bin/env node
/**
 * Pages Direct Upload asset phase.
 * Env: UPLOAD_JWT (Pages upload token for ONE project), DIST_DIR (default ./dist), MANIFEST (default ./.pages-manifest.json)
 * Writes the manifest that the deployment step sends.
 * Uses MD5 of file bytes as hash keys (Cloudflare Pages Direct Upload).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const jwt = process.env.UPLOAD_JWT;
if (!jwt) {
  console.error('UPLOAD_JWT required');
  process.exit(1);
}
const dist = process.env.DIST_DIR || 'dist';
const manifestPath = process.env.MANIFEST || '.pages-manifest.json';
const API = 'https://api.cloudflare.com/client/v4';

function contentType(p) {
  const ext = path.extname(p).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json',
    '.webmanifest': 'application/manifest+json',
  };
  return map[ext] || 'application/octet-stream';
}

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, base, out);
    else out.push(abs);
  }
  return out;
}

async function cf(pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.success === false) {
    throw new Error(`${pathname} ${res.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

const files = walk(dist);
const manifest = {};
const payloads = [];

for (const abs of files) {
  const buf = fs.readFileSync(abs);
  const hash = crypto.createHash('md5').update(buf).digest('hex');
  let rel = '/' + path.relative(dist, abs).split(path.sep).join('/');
  if (rel === '/.') rel = '/index.html';
  manifest[rel] = hash;
  payloads.push({
    path: rel,
    hash,
    contentType: contentType(abs),
    base64: buf.toString('base64'),
    size: buf.length,
  });
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('files', files.length, 'unique hashes', new Set(Object.values(manifest)).size);

const hashes = [...new Set(Object.values(manifest))];
const missingRes = await cf('/pages/assets/check-missing', { hashes });
const missing = missingRes.result || missingRes.result?.hashes || missingRes;
const missingList = Array.isArray(missing) ? missing : (missing.hashes || []);
console.log('missing', missingList.length);

const byHash = new Map();
for (const p of payloads) {
  if (!byHash.has(p.hash)) byHash.set(p.hash, p);
}

const BATCH = 20;
const toUpload = missingList.map(h => byHash.get(h)).filter(Boolean);
for (let i = 0; i < toUpload.length; i += BATCH) {
  const batch = toUpload.slice(i, i + BATCH).map(p => ({
    key: p.hash,
    value: p.base64,
    base64: true,
    metadata: { contentType: p.contentType },
  }));
  await cf('/pages/assets/upload', batch);
  console.log('uploaded', Math.min(i + BATCH, toUpload.length), '/', toUpload.length);
}

await cf('/pages/assets/upsert-hashes', { hashes });
console.log('upserted', hashes.length);
console.log('READY', JSON.stringify({ fileCount: files.length, missing: missingList.length }));
