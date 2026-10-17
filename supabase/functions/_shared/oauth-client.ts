// Who is actually asking to connect, as far as the server can tell.
//
// The consent screen used to print the client_name from its own query string,
// so a link could say "Claude" for any client at all. A registered name proves
// little more: registration is open (RFC 7591) and Claude's own connector
// registers that way, so anybody can register "Claude" too. What cannot be
// faked is where the authorization code goes, because mcp-oauth-consent only
// issues one to a redirect_uri the client registered. So the host of that
// redirect is what the person is shown, and what "verified" is decided on.
//
// No Deno here on purpose: pure, so it runs under deno test and node alike.

export type ClientSlug = "claude" | "chatgpt" | "gemini" | "cursor" | "perplexity";

const KNOWN_HOSTS: Array<[RegExp, ClientSlug, string]> = [
  [/^(.+\.)?claude\.(ai|com)$/, "claude", "Claude"],
  [/^(.+\.)?anthropic\.com$/, "claude", "Claude"],
  [/^(chatgpt\.com|chat\.openai\.com)$/, "chatgpt", "ChatGPT"],
  [/^gemini\.google\.com$/, "gemini", "Gemini"],
  [/^(.+\.)?cursor\.(com|sh)$/, "cursor", "Cursor"],
  [/^(.+\.)?perplexity\.ai$/, "perplexity", "Perplexity"],
];

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const SLUG_BY_LABEL: Record<string, ClientSlug> = {
  Claude: "claude", ChatGPT: "chatgpt", Gemini: "gemini", Cursor: "cursor", Perplexity: "perplexity",
};

export interface ClientDescription {
  /** What to call it on the screen. */
  name: string;
  /** What it called itself when it registered — shown only next to a warning. */
  registeredName: string;
  /** Where approving sends the code: a web host, or the app scheme of a local app. */
  host: string;
  /** The code goes to an app on this device (loopback or a custom scheme). */
  local: boolean;
  /** The destination belongs to an assistant AXON knows, or AXON seeded the client itself. */
  verified: boolean;
  /** Which logo to draw — only ever for a verified client. */
  slug: ClientSlug | null;
}

/**
 * @param registeredName oauth_clients.client_name, as stored at registration
 * @param redirectUri    the redirect_uri, already checked against the registered list
 * @param seededLabel    KNOWN_CLIENT_NAMES[client_id].label for clients AXON created itself
 */
export function describeClient(registeredName: string | null | undefined, redirectUri: string,
                               seededLabel?: string | null): ClientDescription {
  const own = (registeredName ?? "").trim().slice(0, 60) || "An unnamed app";
  let host = "";
  let local = false;
  try {
    const u = new URL(redirectUri);
    if (u.protocol === "http:" || u.protocol === "https:") {
      host = u.hostname.toLowerCase();
      local = LOOPBACK.has(host);
    } else {
      // cursor://…, vscode://… — an app on this device, named by its scheme.
      host = u.protocol.replace(/:$/, "");
      local = true;
    }
  } catch {
    host = "";
  }

  if (seededLabel) {
    return { name: seededLabel, registeredName: own, host, local, verified: true, slug: SLUG_BY_LABEL[seededLabel] ?? null };
  }
  if (!local) {
    for (const [pattern, slug, label] of KNOWN_HOSTS) {
      if (pattern.test(host)) return { name: label, registeredName: own, host, local, verified: true, slug };
    }
  }
  // Unverified on the web: the title and the button name the host, which is the
  // one thing that is true. What it calls itself stays in the warning only, so
  // a stranger's app that registered as "Claude" does not say "Claude" in big type.
  // A local app's host is just "localhost" or a scheme; there its own name helps.
  return { name: local || !host ? own : host, registeredName: own, host, local, verified: false, slug: null };
}
