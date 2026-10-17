/**
 * AXON Memory: TypeScript SDK for the v1 API.
 *
 *   const axon = new Axon({ token: process.env.AXON_TOKEN! });
 *   const { memory_id } = await axon.capture({ content: "We deploy on Fridays only after the smoke suite.", thread: "trading-os" });
 *   const { memories } = await axon.recall({ query: "deploy policy" });
 *
 * Works in Node 18+, Deno, Bun and browsers (uses global fetch). Zero dependencies.
 */

export type Channel = "direct" | "agent" | "connector" | "app" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type LifecycleState = "active" | "superseded" | "retired";

export interface MemorySource {
  channel: Channel;
  type: string;
  provider?: string;
  account?: string;
  client?: string;
  app?: string;
  url?: string;
  at: string | null;
  connection_id: string | null;
  api_key_id: string | null;
  ref: { id: string | null; url: string | null } | null;
}

export interface Memory {
  id: string;
  kind: "memory";
  title: string | null;
  content: string;
  content_type: string | null;
  state: LifecycleState;
  superseded_by?: string;
  thread: { id: string; key: string | null } | null;
  facets: string[];
  source: MemorySource;
  /** true = stated by the user or an assistant; false = an inference. */
  stated: boolean;
  confidence: Confidence;
  relevance?: { score: number; matched_by: string[] };
  created_at: string;
  updated_at: string;
}

export interface Inference {
  id: string;
  category: string;
  statement: string;
  kind: "inference";
  /** Memory ids this conclusion rests on. */
  from: string[];
  from_total?: number;
  derived_by?: string;
  confidence: Confidence;
}

export interface CaptureInput {
  content: string;
  title?: string;
  /** Thread key, e.g. "trading-os". */
  thread?: string;
  facets?: string[];
  occurred_at?: string | Date;
  /** Makes retries safe: the same key never creates a second memory. */
  idempotency_key?: string;
  /** Provenance: who is writing (label) and where it lives at the source (ref). */
  source?: { label?: string; ref?: { id?: string; url?: string } };
}

export interface CaptureResult {
  memory_id: string;
  capture_id: string | null;
  status: "stored" | "indexed" | "duplicate";
  duplicate: boolean;
  index: "indexed" | "queued" | "pending";
  created_at: string | null;
  memory: Memory | null;
}

export interface RecallInput {
  query?: string;
  thread?: string;
  facets?: string[];
  limit?: number;
  include_inferences?: boolean;
}

export interface RecallResult {
  query: string | null;
  thread: { id: string | null; key: string } | null;
  facets: string[];
  memories: Memory[];
  inferences: Inference[];
  signals: string[];
}

export interface Thread { id: string; key: string; name: string; created_at: string }

export interface Me {
  user_id: string;
  plan: string;
  token: { id: string | null; kind: "oauth" | "personal"; client: string | null; scope: string | null; can_write: boolean };
  api_version: "v1";
}

export type AxonErrorCode =
  | "unauthorized" | "forbidden_scope" | "not_found" | "invalid" | "method_not_allowed"
  | "rate_limited" | "conflict" | "gone" | "capture_failed" | "server_error" | "network_error";

export class AxonError extends Error {
  constructor(
    readonly status: number,
    readonly code: AxonErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly details: Record<string, unknown> = {},
    /** Seconds, from Retry-After on 429. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "AxonError";
  }
}

export interface AxonOptions {
  /** Personal key (axon_live_…) or OAuth access token. */
  token: string;
  /** Default https://mcp.axon-memory.com/v1 */
  baseUrl?: string;
  /** Inject for tests or custom runtimes. */
  fetch?: typeof fetch;
  /** Retries for retryable failures (5xx, 429, network). Default 2. */
  maxRetries?: number;
  /** Per-request timeout in ms. Default 20000. */
  timeoutMs?: number;
}

export const DEFAULT_BASE_URL = "https://mcp.axon-memory.com/v1";

export class Axon {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(opts: AxonOptions) {
    if (!opts?.token) throw new Error("Axon: token is required");
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = opts.maxRetries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  // ── Capture / recall ──
  capture(input: CaptureInput): Promise<CaptureResult> {
    const body = { ...input, occurred_at: input.occurred_at instanceof Date ? input.occurred_at.toISOString() : input.occurred_at };
    // An idempotency key makes a retried POST safe; without one, POSTs are not retried.
    return this.request("POST", "/memories", body, { retry: !!input.idempotency_key });
  }
  recall(input: RecallInput = {}): Promise<RecallResult> {
    return this.request("POST", "/recall", input);
  }

  // ── One memory ──
  get(id: string): Promise<Memory> {
    return this.request("GET", `/memories/${enc(id)}`);
  }
  retire(id: string, reason?: string): Promise<{ changed: boolean; memory: Memory }> {
    return this.request("POST", `/memories/${enc(id)}/retire`, reason ? { reason } : {});
  }
  restore(id: string): Promise<{ changed: boolean; memory: Memory }> {
    return this.request("POST", `/memories/${enc(id)}/restore`, {});
  }
  supersede(oldId: string, replacement: { new_id: string; reason?: string } | { content: string; thread?: string; reason?: string }): Promise<{ changed: boolean; old: Memory; new: Memory }> {
    return this.request("POST", `/memories/${enc(oldId)}/supersede`, replacement, { retry: "new_id" in replacement });
  }
  /** Permanent: removes the memory, its vectors, links and conclusions drawn only from it. */
  delete(id: string): Promise<{ deleted: true; id: string; removed: Record<string, unknown> }> {
    return this.request("DELETE", `/memories/${enc(id)}`);
  }

  // ── Context ──
  threads(): Promise<{ threads: Thread[] }> {
    return this.request("GET", "/threads");
  }
  me(): Promise<Me> {
    return this.request("GET", "/me");
  }
  captureStatus(): Promise<{ health: Record<string, unknown> | null; needs_attention: Array<Record<string, unknown>> }> {
    return this.request("GET", "/captures");
  }
  getCapture(id: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/captures/${enc(id)}`);
  }
  retryCapture(id: string): Promise<Omit<CaptureResult, "memory">> {
    return this.request("POST", `/captures/${enc(id)}/retry`, {}, { retry: true });
  }
  health(): Promise<{ status: string; api_version: string; build: string; time: string }> {
    return this.request("GET", "/health");
  }

  // ── Transport ──
  private async request<T>(method: string, path: string, body?: unknown, opt: { retry?: boolean } = {}): Promise<T> {
    const idempotent = method === "GET" || method === "DELETE" || opt.retry === true;
    let attempt = 0;
    for (;;) {
      let res: Response;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
      try {
        res = await this.fetchImpl(this.baseUrl + path, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: ctl.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (idempotent && attempt < this.maxRetries) { await sleep(backoff(attempt++)); continue; }
        throw new AxonError(0, "network_error", err instanceof Error ? err.message : String(err), true);
      }
      clearTimeout(timer);
      const text = await res.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (res.ok) return data as T;

      const e = (data as { error?: { code?: AxonErrorCode; message?: string; retryable?: boolean } } | null)?.error;
      const retryAfter = Number(res.headers.get("retry-after")) || undefined;
      const err = new AxonError(
        res.status,
        e?.code ?? (res.status === 401 ? "unauthorized" : res.status >= 500 ? "server_error" : "invalid"),
        e?.message ?? `HTTP ${res.status}`,
        e?.retryable ?? (res.status >= 500 || res.status === 429),
        (e ?? {}) as Record<string, unknown>,
        retryAfter,
      );
      if (err.retryable && idempotent && attempt < this.maxRetries) {
        await sleep(retryAfter ? Math.min(retryAfter, 30) * 1000 : backoff(attempt++));
        if (retryAfter) attempt++;
        continue;
      }
      throw err;
    }
  }
}

const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (n: number) => Math.min(4000, 250 * 2 ** n) + Math.floor(Math.random() * 100);

export default Axon;
