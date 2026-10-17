// OpenAPI 3.1 description of the AXON v1 API. Served at GET /v1/openapi.json.
// Keep in step with _shared/api-v1.ts and packages/sdk-ts (tests check the paths).
const memory = {
  type: "object",
  required: ["id", "kind", "content", "state", "thread", "facets", "source", "stated", "confidence", "created_at"],
  properties: {
    id: { type: "string", format: "uuid" },
    kind: { const: "memory" },
    title: { type: ["string", "null"] },
    content: { type: "string" },
    content_type: { type: ["string", "null"] },
    state: { enum: ["active", "superseded", "retired"] },
    superseded_by: { type: "string", format: "uuid" },
    thread: { type: ["object", "null"], properties: { id: { type: "string" }, key: { type: ["string", "null"] } } },
    facets: { type: "array", items: { type: "string" } },
    source: {
      type: "object",
      properties: {
        channel: { enum: ["direct", "agent", "connector", "unknown"] },
        type: { type: "string" }, provider: { type: "string" }, account: { type: "string" }, client: { type: "string" },
        app: { type: "string" }, url: { type: "string" }, at: { type: ["string", "null"] },
        connection_id: { type: ["string", "null"] }, api_key_id: { type: ["string", "null"] },
        ref: { type: ["object", "null"], properties: { id: { type: ["string", "null"] }, url: { type: ["string", "null"] } } },
      },
    },
    stated: { type: "boolean", description: "true = the user's/assistant's own statement; false = an inference" },
    confidence: { enum: ["high", "medium", "low"] },
    relevance: { type: "object", properties: { score: { type: "number" }, matched_by: { type: "array", items: { type: "string" } } } },
    created_at: { type: "string" }, updated_at: { type: "string" },
  },
};
const error = {
  type: "object",
  properties: { error: { type: "object", required: ["code", "message", "retryable"], properties: {
    code: { enum: ["unauthorized", "forbidden_scope", "not_found", "invalid", "method_not_allowed", "rate_limited", "conflict", "gone", "capture_failed", "server_error"] },
    message: { type: "string" }, retryable: { type: "boolean" }, capture_id: { type: ["string", "null"] }, stage: { type: "string" },
  } } },
};
const err = (d: string) => ({ description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const ok = (schema: unknown, d = "OK") => ({ description: d, content: { "application/json": { schema } } });
const idParam = [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }];
const json = (schema: unknown) => ({ required: true, content: { "application/json": { schema } } });
const common = { "401": err("Missing, unknown, revoked or expired token"), "429": err("Rate limited (60/min per token, shared with MCP)") };
const write = { ...common, "403": err("Token lacks memory.write") };

export const OPENAPI = {
  openapi: "3.1.0",
  info: { title: "AXON Memory API", version: "1.0.0", description: "Capture, recall and manage a user's AXON Memory. Bearer auth with a personal key (axon_live_…) or an OAuth access token." },
  servers: [{ url: "https://mcp.axon-memory.com/v1" }, { url: "https://ktaditgtbubonrahyiig.supabase.co/functions/v1/api-v1/v1" }],
  security: [{ bearer: [] }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: { Memory: memory, Error: error },
  },
  paths: {
    "/health": { get: { security: [], summary: "Liveness (no auth, no user data)", responses: { "200": ok({ type: "object" }) } } },
    "/me": { get: { summary: "Who this token is", responses: { "200": ok({ type: "object" }), ...common } } },
    "/memories": {
      post: {
        summary: "Capture a memory",
        parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" } }],
        requestBody: json({ type: "object", required: ["content"], properties: {
          content: { type: "string", maxLength: 20000 }, title: { type: "string" }, thread: { type: "string", description: "thread key" },
          facets: { type: "array", items: { type: "string" } }, occurred_at: { type: "string", format: "date-time" },
          idempotency_key: { type: "string" },
          source: { type: "object", properties: { label: { type: "string" }, ref: { type: "object", properties: { id: { type: "string" }, url: { type: "string" } } } } },
        } }),
        responses: { "201": ok({ type: "object", properties: { memory_id: { type: "string" }, capture_id: { type: ["string", "null"] }, status: { type: "string" }, duplicate: { type: "boolean" }, index: { type: "string" }, memory: { $ref: "#/components/schemas/Memory" } } }, "Captured (or an idempotent duplicate)"), "400": err("Invalid"), "409": err("Same idempotency key in flight"), "410": err("That capture's memory was deleted"), ...write },
      },
    },
    "/memories/{id}": {
      get: { summary: "Get one memory", parameters: idParam, responses: { "200": ok({ $ref: "#/components/schemas/Memory" }), "404": err("Not on this account"), ...common } },
      delete: { summary: "Delete permanently (propagates to vectors, links, derived conclusions)", parameters: idParam, responses: { "200": ok({ type: "object" }), "404": err("Not on this account"), ...write } },
    },
    "/memories/{id}/retire": { post: { summary: "Take out of recall (reversible)", parameters: idParam, requestBody: { content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } } }, responses: { "200": ok({ type: "object" }), "404": err("Not found"), ...write } } },
    "/memories/{id}/restore": { post: { summary: "Back into recall", parameters: idParam, responses: { "200": ok({ type: "object" }), "404": err("Not found"), ...write } } },
    "/memories/{id}/supersede": { post: { summary: "Replace with a newer memory (old kept as history)", parameters: idParam, requestBody: json({ type: "object", properties: { new_id: { type: "string" }, content: { type: "string" }, thread: { type: "string" }, reason: { type: "string" } } }), responses: { "200": ok({ type: "object" }), "404": err("Not found"), ...write } } },
    "/recall": { post: { summary: "Ranked recall with source trace; inferences kept separate", requestBody: json({ type: "object", properties: { query: { type: "string" }, thread: { type: "string" }, facets: { type: "array", items: { type: "string" } }, limit: { type: "integer", minimum: 1, maximum: 50 }, include_inferences: { type: "boolean" } } }), responses: { "200": ok({ type: "object", properties: { memories: { type: "array", items: { $ref: "#/components/schemas/Memory" } }, inferences: { type: "array" } } }), ...common } } },
    "/threads": { get: { summary: "List threads (keys to pass as `thread`)", responses: { "200": ok({ type: "object" }), ...common } } },
    "/captures": { get: { summary: "Capture health (24h) and captures needing attention", responses: { "200": ok({ type: "object" }), ...common } } },
    "/captures/{id}": { get: { summary: "One capture's status", parameters: idParam, responses: { "200": ok({ type: "object" }), "404": err("Not found"), ...common } } },
    "/captures/{id}/retry": { post: { summary: "Retry a failed capture from its saved payload", parameters: idParam, responses: { "201": ok({ type: "object" }), "404": err("Not found"), ...write } } },
  },
};
