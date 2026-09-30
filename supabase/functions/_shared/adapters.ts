// Who is asking, in one vocabulary.
//
// An MCP client names itself when it registers, and that name is free text:
// "Claude", "claude-desktop", "Cursor (MCP)", "ChatGPT Actions". The terrain,
// the recall rows and the adapter summits all have to agree on which of those
// mean the same assistant, or a memory read by Claude Desktop and one read by
// Claude Code become two unrelated things on the graph.
//
// Mirrored on the frontend in `src/lib/adapters.js` — keep the two in step.

export type AdapterKey =
  | "anthropic"
  | "openai"
  | "gemini"
  | "cursor"
  | "perplexity"
  | "grok"
  | "other";

type Matcher = { key: AdapterKey; label: string; pattern: RegExp };

// Order matters: the first match wins, so narrower names come before the ones
// that would also swallow them.
const MATCHERS: Matcher[] = [
  { key: "cursor", label: "Cursor", pattern: /cursor/i },
  { key: "perplexity", label: "Perplexity", pattern: /perplexity/i },
  { key: "grok", label: "Grok", pattern: /\bgrok\b|\bxai\b/i },
  { key: "gemini", label: "Gemini", pattern: /gemini|bard/i },
  { key: "anthropic", label: "Claude", pattern: /claude|anthropic/i },
  { key: "openai", label: "ChatGPT", pattern: /chatgpt|openai|\bgpt\b/i },
];

/** Normalise a client's self-declared name to an adapter id. */
export function adapterKeyFromLabel(label: string | null | undefined): AdapterKey {
  if (!label) return "other";
  for (const m of MATCHERS) {
    if (m.pattern.test(label)) return m.key;
  }
  return "other";
}

/** The name a person would recognise, falling back to what the client called itself. */
export function adapterDisplayName(label: string | null | undefined): string {
  if (!label) return "Unknown client";
  for (const m of MATCHERS) {
    if (m.pattern.test(label)) return m.label;
  }
  return label;
}

/**
 * A key for an app nobody hardcoded.
 *
 * The matcher list names twelve assistants, and anything else — a desktop app,
 * somebody's script, a client written next week — collapsed into "manual"
 * along with everything that sent no name at all. So an app could identify
 * itself correctly and still be filed as anonymous, and a memory layer whose
 * whole claim is "any AI app" recognised exactly the twelve it shipped with.
 *
 * A label that matched nothing becomes its own key instead. Slugged hard —
 * lowercase, non-alphanumerics folded to single hyphens, capped at 32 — because
 * this ends up in a URL filter, a colour lookup and a summit name, and a label
 * is whatever a client felt like sending.
 *
 * Returns null when there is nothing usable left, so the caller can fall back
 * to "manual" rather than storing an empty string that would quietly become a
 * summit for nothing.
 */
export function slugFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : null;
}
