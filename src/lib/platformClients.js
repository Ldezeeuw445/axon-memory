// Fixed, shared OAuth credentials for platforms that require whoever builds
// the integration to paste a Client ID/Secret into their own builder UI
// (ChatGPT Custom GPT Actions, and eventually Gemini). These are safe to
// show in the app: they identify the *integration*, not any individual
// user — the actual account link happens when the user logs into Axon and
// approves the connection, same as the Claude flow. Matches the row seeded
// in supabase/migrations/20260806110000_seed_platform_oauth_clients.sql.
export const MCP_GATEWAY_URL = 'https://mcp.axon-memory.com';

export const CHATGPT_ACTION_CLIENT = {
  clientId: 'axon-chatgpt-actions',
  clientSecret: 'axoncs_50f40c334ffbc0146d7f544d7efea45421442b04d357f55d',
  authorizationUrl: `${MCP_GATEWAY_URL}/authorize`,
  tokenUrl: `${MCP_GATEWAY_URL}/token`,
  scope: 'memory.read memory.write',
  openApiUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openapi-actions`,
};
