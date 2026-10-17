import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/facets.css';
import '../styles/home.css';

// Developer reference. Every line is taken from docs/API.md and docs/MCP.md;
// nothing here describes an endpoint that does not exist.
const ENDPOINTS = [
  ['GET', '/v1/me', 'Who the token acts for, its plan and what it may do.'],
  ['POST', '/v1/memories', 'Capture. content, plus optional title, thread, facets, idempotency_key, source.'],
  ['POST', '/v1/recall', 'Recall by query, thread or facets. Memories and conclusions come back apart.'],
  ['GET', '/v1/memories/{id}', 'One memory, with where it came from.'],
  ['POST', '/v1/memories/{id}/retire', 'Out of recall, reversible. /restore brings it back.'],
  ['POST', '/v1/memories/{id}/supersede', 'Replace it; the old one is kept as the record.'],
  ['DELETE', '/v1/memories/{id}', 'Permanent, everywhere it reached.'],
  ['GET', '/v1/threads', 'Thread keys to pass as thread.'],
  ['GET', '/v1/connectors', 'Each connected source and how it is doing.'],
  ['GET', '/v1/openapi.json', 'The whole contract, machine-readable. No auth.'],
];

export default function Developers() {
  return (
    <div className="hm-page">
      <header className="hm-nav">
        <Link to="/" className="hm-brand"><img src="/app-icon-1024.png" alt="" width="28" height="28" /> AXON</Link>
        <nav className="hm-nav-links"><Link to="/">Home</Link><a href="https://github.com/Ldezeeuw445/axon-memory/blob/main/docs/API.md" target="_blank" rel="noreferrer">Full reference</a></nav>
      </header>
      <main className="hm-doc">
        <div className="ax-eyebrow">Developers</div>
        <h1 className="hm-h2" style={{ marginTop: 10 }}>One contract for every client.</h1>
        <p className="hm-lead">The AXON app, every MCP client and your own code use the same API. Every call acts on one account only; another account's memory answers 404, never "forbidden".</p>

        <h2 className="hm-h3">MCP</h2>
        <p className="hm-p">Add <code>https://mcp.axon-memory.com</code> as a remote MCP server. The client signs in with OAuth (PKCE) and you choose its scope on the consent screen.</p>

        <h2 className="hm-h3">HTTP</h2>
        <p className="hm-p">Base URL <code>https://mcp.axon-memory.com/v1</code>. Send <code>Authorization: Bearer &lt;token&gt;</code> with a personal key (Power and Lifetime) or an OAuth access token. 60 calls a minute per token.</p>
        <pre className="hm-code">{`curl https://mcp.axon-memory.com/v1/recall \\
  -H "Authorization: Bearer $AXON_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "launch date", "limit": 5}'`}</pre>
        <div className="hm-endpoints">
          {ENDPOINTS.map(([m, p, w]) => (
            <div key={p + m} className="hm-endpoint"><span className="hm-method">{m}</span><code>{p}</code><span>{w}</span></div>
          ))}
        </div>

        <h2 className="hm-h3">TypeScript SDK</h2>
        <p className="hm-p">A typed client with retries and idempotent capture lives in the repository at <a href="https://github.com/Ldezeeuw445/axon-memory/tree/main/packages/sdk-ts" target="_blank" rel="noreferrer">packages/sdk-ts</a>. It is not on npm yet.</p>
        <pre className="hm-code">{`import { Axon } from './packages/sdk-ts';
const axon = new Axon({ token: process.env.AXON_KEY });
await axon.capture({ content: 'Prefers TypeScript, few dependencies.' });
const { memories } = await axon.recall({ query: 'how I like code' });`}</pre>
      </main>
    </div>
  );
}
