// Per-provider OAuth config. Client IDs/secrets are Supabase project secrets, e.g.:
//   supabase secrets set GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=...
//   supabase secrets set GITHUB_OAUTH_CLIENT_ID=... GITHUB_OAUTH_CLIENT_SECRET=...
//   supabase secrets set NOTION_OAUTH_CLIENT_ID=... NOTION_OAUTH_CLIENT_SECRET=...
//   supabase secrets set SLACK_OAUTH_CLIENT_ID=... SLACK_OAUTH_CLIENT_SECRET=...
export type Provider = "gmail" | "github" | "notion" | "slack";

export function redirectUri() {
  // Edge Functions are reachable at <project-url>/functions/v1/<fn-name>.
  //
  // Deliberately no query string. Every provider requires the redirect URI to
  // match what is registered byte for byte, and a `?provider=` suffix meant
  // four separate URIs to register, each an opportunity for a mismatch that
  // surfaces only as a generic redirect_uri_mismatch. Which provider it is
  // comes out of the signed `state` instead — that is also the safer source,
  // since a query parameter is attacker-controllable and the state is not.
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  return `${projectUrl}/functions/v1/oauth-callback`;
}

export const PROVIDERS: Record<
  Provider,
  {
    authorizeUrl: (state: string) => string;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scopes: string;
    extraTokenParams?: Record<string, string>;
  }
> = {
  gmail: {
    authorizeUrl: (state) => {
      const params = new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "",
        redirect_uri: redirectUri(),
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: "https://www.googleapis.com/auth/gmail.readonly openid email",
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    },
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "",
    scopes: "gmail.readonly",
  },
  github: {
    authorizeUrl: (state) => {
      const params = new URLSearchParams({
        client_id: Deno.env.get("GITHUB_OAUTH_CLIENT_ID") ?? "",
        redirect_uri: redirectUri(),
        scope: "repo read:user",
        state,
      });
      return `https://github.com/login/oauth/authorize?${params}`;
    },
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: Deno.env.get("GITHUB_OAUTH_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET") ?? "",
    scopes: "repo read:user",
  },
  notion: {
    authorizeUrl: (state) => {
      const params = new URLSearchParams({
        client_id: Deno.env.get("NOTION_OAUTH_CLIENT_ID") ?? "",
        redirect_uri: redirectUri(),
        response_type: "code",
        owner: "user",
        state,
      });
      return `https://api.notion.com/v1/oauth/authorize?${params}`;
    },
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientId: Deno.env.get("NOTION_OAUTH_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("NOTION_OAUTH_CLIENT_SECRET") ?? "",
    scopes: "",
  },
  slack: {
    authorizeUrl: (state) => {
      const params = new URLSearchParams({
        client_id: Deno.env.get("SLACK_OAUTH_CLIENT_ID") ?? "",
        redirect_uri: redirectUri(),
        // source-sync.ts's conversations.list asks for BOTH public and
        // private channels (types=public_channel,private_channel). Slack
        // gates each channel type behind its own read scope — channels:read
        // only covers the public_channel half of that request. groups:read
        // was missing, so listing ever failed the moment a private channel
        // was in scope, before sync got anywhere near groups:history (which
        // only covers reading messages in a channel already listed).
        scope: "channels:history,channels:read,groups:history,groups:read,users:read,team:read",
        user_scope: "",
        state,
      });
      return `https://slack.com/oauth/v2/authorize?${params}`;
    },
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientId: Deno.env.get("SLACK_OAUTH_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("SLACK_OAUTH_CLIENT_SECRET") ?? "",
    scopes: "channels:history,channels:read,groups:history,groups:read,users:read,team:read",
  },
};

