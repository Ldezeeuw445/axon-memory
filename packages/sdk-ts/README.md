# @axon-memory/sdk

TypeScript client for the AXON Memory v1 API (`docs/API.md`). Zero dependencies. Works in Node 18+, Deno, Bun and browsers.

```ts
import { Axon, AxonError } from "@axon-memory/sdk";

const axon = new Axon({ token: process.env.AXON_TOKEN! }); // personal key or OAuth access token

const saved = await axon.capture({
  content: "We only deploy after the smoke suite passes.",
  thread: "trading-os",
  idempotency_key: "deploy-policy-2026-10",           // makes retries safe
  source: { label: "axe-code", ref: { url: "https://github.com/acme/repo/pull/12" } },
});

const { memories, inferences } = await axon.recall({ query: "deploy policy", thread: "trading-os" });
for (const m of memories) console.log(m.content, m.source.channel, m.confidence, m.relevance?.matched_by);

await axon.supersede(saved.memory_id, { content: "Deploys need the smoke suite and a canary." });
await axon.retire(id); await axon.restore(id); await axon.delete(id);

try { await axon.get("…"); } catch (e) { if (e instanceof AxonError && e.code === "not_found") { /* … */ } }
```

- Retries only what is safe to retry: GET and DELETE, a capture with an `idempotency_key`, and a `supersede` by `new_id`. Retryable means 5xx, 429 (honours `Retry-After`) or a network error.
- Errors are `AxonError { status, code, message, retryable, details, retryAfter }`.

Build: `npm run build`. Unit tests: `npm test`. Live tests (throwaway users only): `AXON_FIXTURES=… npm run test:integration`.
