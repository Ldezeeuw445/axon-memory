// POST /functions/v1/notify-me   { "email": "...", "source": "landing" }
//
// The door for somebody who wants AXON but not today. Called by a visitor with
// no account and no session, so it takes no auth — see film-watch for the same
// reasoning about an open endpoint.
//
// It is stricter than film-watch on purpose. That one stores numbers nobody
// can misuse; this one stores other people's email addresses, so a junk row
// here is a person we will one day mail who never asked. Hence: validate the
// address rather than clamp it, cap the length, and refuse rather than shrug.
//
// What it never returns: whether an address was already on the list. "You are
// already signed up" turns a public endpoint into a way to test whether
// somebody you know uses this product. Same answer either way.
import { handlePublicPreflight as handlePreflight, publicJsonResponse as jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const MAX_BODY = 1024;
// Long enough for any real address, short enough that nobody stores an essay.
const MAX_EMAIL = 254;
const SOURCES = new Set(["landing", "film", "pricing"]);

/**
 * Deliberately permissive. A regex that tries to be RFC 5322 rejects addresses
 * that work, and the only thing that actually proves an address is sending to
 * it — which is the confirmation mail, not this. So: one @, something either
 * side, a dot in the domain, no spaces.
 */
function looksLikeAnAddress(value: string): boolean {
  if (value.length > MAX_EMAIL) return false;
  // Character for character the rule the form uses, and a test compares the two
  // sources so it stays that way. A form that accepts what the server refuses
  // tells the visitor nothing useful at either end.
  return /^[^@\s]+@[^@.\s]+(\.[^@.\s]+)+$/.test(value);
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, { status: 405 });

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return jsonResponse({ error: "too long" }, { status: 400 });
    body = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse({ error: "unreadable" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!looksLikeAnAddress(email)) {
    return jsonResponse({ error: "that does not look like an email address" }, { status: 400 });
  }

  const source = typeof body.source === "string" && SOURCES.has(body.source) ? body.source : "landing";

  const { error } = await supabaseAdmin()
    .from("landing_interest")
    .upsert({ email, source }, { onConflict: "email", ignoreDuplicates: true });

  if (error) {
    // A unique-index conflict is somebody pressing twice, which is not a fault
    // and must not be reported as one — to them or to us.
    if (error.code === "23505") return jsonResponse({ ok: true });
    // Never the address in the log. A log line is not the place for it.
    console.error("notify-me: insert failed", error.code ?? error.message);
    return jsonResponse({ error: "could not save that" }, { status: 500 });
  }

  return jsonResponse({ ok: true });
});
