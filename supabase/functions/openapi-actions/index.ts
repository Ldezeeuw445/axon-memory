// GET /openapi-actions — OpenAPI 3.1 document describing the recall/remember
// API for platforms that consume "Actions"/"Extensions" schemas instead of
// native MCP (ChatGPT Custom GPTs, Gemini Extensions/Gems). The security
// scheme below points at the SAME mcp.axon-memory.com OAuth endpoints Claude
// uses — the app owner pastes this one URL into the GPT/Extension builder
// once; end users then get a normal "Sign in with Axon Memory" button and
// never see a token. Same api_keys table underneath, same shared memory.
import { handlePreflight } from "../_shared/cors.ts";
import { mcpOrigin } from "../_shared/oauth.ts";

Deno.serve((req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const functionsBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
  const authBase = mcpOrigin();

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Axon Memory",
      description:
        "Read and write the user's persistent Axon Memory — the same memory shared across every AI assistant they've connected.",
      version: "1.0.0",
    },
    servers: [{ url: functionsBase }],
    paths: {
      "/context-pack": {
        get: {
          operationId: "recallContext",
          summary: "Recall the user's remembered context",
          description: "Call this before answering, or whenever you need to know something the user already told another assistant or connected app.",
          parameters: [
            { name: "query", in: "query", schema: { type: "string" }, description: "What you're trying to find out. Omit for a general overview." },
            { name: "limit_tokens", in: "query", schema: { type: "integer", default: 1500 }, description: "Approximate max tokens to return." },
          ],
          responses: { "200": { description: "Context pack", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/remember": {
        post: {
          operationId: "remember",
          summary: "Save a fact, preference, or note to the user's Axon Memory",
          description: "Anything saved here is immediately available to every other AI assistant connected to this account.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["content"],
                  properties: {
                    content: { type: "string" },
                    title: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Saved", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
    },
    components: {
      securitySchemes: {
        AxonOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${authBase}/authorize`,
              tokenUrl: `${authBase}/token`,
              scopes: { "memory.read": "Read your Axon Memory", "memory.write": "Save to your Axon Memory" },
            },
          },
        },
      },
    },
    security: [{ AxonOAuth: ["memory.read", "memory.write"] }],
  };

  return new Response(JSON.stringify(spec, null, 2), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
});
