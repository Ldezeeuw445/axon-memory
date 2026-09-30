// GET /functions/v1/oauth-callback?code=...&state=...
// Public (no user JWT — the provider hits this directly). Verified via signed `state`.
// Exchanges the code for tokens, encrypts + upserts source_connections, then
// redirects the browser back into the app.
import { handlePreflight } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { PROVIDERS, Provider, missingScopes, redirectUri } from "../_shared/providers.ts";
import { encryptToken, parseState } from "../_shared/crypto.ts";
import { seedGithubRepositories, syncOneConnection } from "../_shared/source-sync.ts";
import { distillForUser } from "../_shared/distill.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

function redirectToApp(pathAndQuery: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_URL}${pathAndQuery}` },
  });
}

async function exchangeCode(provider: Provider, code: string) {
  const cfg = PROVIDERS[provider];

  // Notion is the odd one out: its token endpoint expects HTTP Basic auth and
  // a JSON body, not the client credentials form-encoded alongside the code.
  // Sending it the same shape as Google and GitHub fails the exchange even
  // when the redirect URI and the credentials are all correct.
  const isNotion = provider === "notion";

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": isNotion ? "application/json" : "application/x-www-form-urlencoded",
  };
  let body: string;

  if (isNotion) {
    headers.Authorization = `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`;
    body = JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    });
  } else {
    body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }).toString();
  }

  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);

  const json = await res.json();
  // Slack answers 200 with {ok:false,error:"..."} rather than an HTTP error, so
  // a failed exchange would otherwise sail through as success.
  if (json?.ok === false) throw new Error(`slack_${json.error ?? "unknown"}`);
  // GitHub does the same with a bare {error, error_description}, and Google
  // returns {error} on a rejected code. Without this the failure only surfaces
  // further down, where the cause is no longer visible.
  if (typeof json?.error === "string") {
    throw new Error(`${json.error}${json.error_description ? `: ${String(json.error_description).slice(0, 140)}` : ""}`);
  }
  if (!json?.access_token) throw new Error("no_access_token_in_response");
  return json;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) return redirectToApp(`/?facet=connections&error=${encodeURIComponent(errorParam)}`);
  if (!code || !stateRaw) return redirectToApp("/?facet=connections&error=missing_params");

  // The provider now comes out of the signed state rather than the query, so
  // the callback URL can stay clean and there is nothing to cross-check.
  let userId: string;
  let provider: Provider;
  try {
    const state = await parseState(stateRaw);
    if (Date.now() - state.ts > 10 * 60 * 1000) throw new Error("state expired");
    if (!(state.provider in PROVIDERS)) throw new Error("unknown provider in state");
    userId = state.userId;
    provider = state.provider as Provider;
  } catch {
    return redirectToApp("/?facet=connections&error=invalid_state");
  }

  try {
    const tokens = await exchangeCode(provider, code);
    const accessToken = tokens.access_token as string;

    /* Check what was actually granted, not what was asked for.
     *
     * Google shows restricted scopes as separate checkboxes: somebody can
     * approve signing in and leave "read your mail" unticked, and the flow
     * still completes with a valid token. We said "Connected", the card said
     * Connected, and the next sync came back 403 insufficientPermissions — a
     * successful connection to something we cannot read. That is the same
     * silent lie as a save that did not save, in a different place.
     *
     * The token response carries the granted scope. If the one thing this
     * connection exists for is missing, the row is stored so the tokens are not
     * thrown away, and it says why on its own face instead of waiting half an
     * hour for the cron to discover it.
     */
    const granted = typeof tokens.scope === "string" ? tokens.scope : null;
    const needed = PROVIDERS[provider]?.scopes ?? null;
    // Scope by scope, because no two providers agree on a separator. Asking
    // whether the whole needed string appears inside the granted one told
    // every GitHub user who ticked both boxes that they had declined one.
    const scopeMissing = missingScopes(granted, needed);
    const refreshToken = (tokens.refresh_token as string) ?? null;
    const expiresIn = (tokens.expires_in as number) ?? null;

    const admin = supabaseAdmin();
    let label: string | null = null;
    // The stable id of the account that just authorised, which is what decides
    // whether this is a NEW connection or a reconnect of an existing one. The
    // label is for people; this is for the database. Without it a second Gmail
    // overwrote the first, because "the user's gmail connection" was the only
    // identity a row could have.
    let accountId: string | null = null;

    // Best-effort: fetch a human-readable label for the connected account
    try {
      if (provider === "gmail" || provider === "google_drive") {
        const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) {
          const me = await r.json();
          label = me.email ?? null;
          // Google's subject id rather than the address: an address can be
          // changed on a Workspace account, the sub cannot.
          accountId = me.id ?? me.email ?? null;
        }
      } else if (provider === "outlook") {
        const r = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) {
          const me = await r.json();
          label = me.mail ?? me.userPrincipalName ?? null;
          accountId = me.id ?? me.mail ?? me.userPrincipalName ?? null;
        }
      } else if (provider === "supabase") {
        // The Management API has no "me" endpoint; the organisation list is
        // the closest thing to an identity for a granted authorisation, and it
        // is what a person would recognise.
        const r = await fetch("https://api.supabase.com/v1/organizations", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) {
          const orgs = await r.json();
          label = orgs?.[0]?.name ?? null;
          accountId = orgs?.[0]?.id ?? null;
        }
      } else if (provider === "github") {
        const r = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "axon-memory" },
        });
        if (r.ok) {
          const me = await r.json();
          label = me.login ?? null;
          accountId = me.id ? String(me.id) : (me.login ?? null);
        }
      } else if (provider === "slack") {
        label = tokens.team?.name ?? null;
        accountId = tokens.team?.id ?? null;
      } else if (provider === "notion") {
        label = tokens.workspace_name ?? null;
        accountId = tokens.workspace_id ?? null;
      } else if (provider === "linear") {
        // Linear names the organisation, not the person — which is the useful
        // label here, since that is what the issues belong to.
        const r = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "{ organization { name } }" }),
        });
        if (r.ok) {
          const org = (await r.json())?.data?.organization ?? null;
          label = org?.name ?? null;
          accountId = org?.id ?? null;
        }
      }
    } catch {
      // non-fatal
    }

    const row = {
      user_id: userId,
      provider,
      status: scopeMissing ? "error" : "connected",
      last_error: scopeMissing
        ? `permission not granted: ${scopeMissing}. Reconnect and leave every box ticked.`
        : null,
      external_account_id: accountId,
      external_account_label: label,
      access_token_encrypted: await encryptToken(accessToken),
      refresh_token_encrypted: refreshToken ? await encryptToken(refreshToken) : null,
      token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    };

    // Matched on the account, not on the provider, so authorising a second
    // mailbox adds a connection instead of replacing the first one. A repeat
    // authorisation of the SAME account still updates in place — that is a
    // reconnect, and it should not leave two rows behind.
    //
    // Written as a find-then-write rather than an upsert because the uniqueness
    // is enforced by an expression index (coalesce(external_account_id, '')),
    // and PostgREST's on_conflict can only name plain columns.
    const lookup = admin
      .from("source_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", provider);
    // `eq(col, '')` never matches NULL, so a provider that gave us no id would
    // have found nothing and inserted a duplicate on every reconnect.
    let existing = await (accountId
      ? lookup.eq("external_account_id", accountId)
      : lookup.is("external_account_id", null)
    ).maybeSingle();

    // Adopt a row that predates account ids, rather than landing beside it.
    //
    // Every provider here derives an id, but rows connected before that was
    // true carry NULL. Matching on the id alone means the first reconnect
    // after this shipped finds nothing and inserts a SECOND row — which is
    // exactly what happened to a Gmail connection holding eighty-one memories:
    // the memories stayed pointing at the old row, the new row started empty,
    // and a later sync would have re-imported all eighty-one as new items
    // against the new connection.
    //
    // maybeSingle, deliberately: with two legacy rows for one provider there is
    // no way to tell which account is being reconnected, and inserting a fresh
    // row is the honest answer. Adopting one at random would silently attach
    // somebody's work mail to their personal account.
    if (accountId && !existing.data?.id) {
      existing = await admin
        .from("source_connections")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", provider)
        .is("external_account_id", null)
        .maybeSingle();
    }

    /* The id comes back from the write. Looking it up afterwards by user and
       provider would pick the wrong row for somebody with two mailboxes, and
       the first sync would then run against the account they did not just
       connect. */
    const { data: saved, error: saveErr } = existing.data?.id
      ? await admin.from("source_connections").update(row).eq("id", existing.data.id)
        .select("id").maybeSingle()
      : await admin.from("source_connections").insert(row).select("id").maybeSingle();
    // Unchecked, this reported a successful connection for a row the database
    // had refused — the app said connected and then showed Connect again, with
    // nothing anywhere to explain it.
    if (saveErr) throw new Error(`could_not_save_connection: ${saveErr.message}`);

    /* A first GitHub connection arrives with nothing chosen, and the sync a
       minute later would have marked it broken for exactly that. One project
       per repository is true for most people and puts something on the terrain
       before they have decided anything; merging two afterwards is a smaller
       act than naming five from an empty screen.

       After the connection is saved and never in front of it: seeding is a
       convenience, and losing a token because GitHub was slow is not. Its
       failure is logged as a count and swallowed — worst case somebody picks
       their own repositories on the screen that already exists. */
    if (provider === "github" && !scopeMissing) {
      try {
        const seeded = await seedGithubRepositories(admin, userId, accessToken);
        console.log(
          `oauth-callback: seeded ${seeded.created} repositories${seeded.reason ? ` (${seeded.reason})` : ""}`,
        );
      } catch (seedErr) {
        console.error(
          "oauth-callback: seeding failed",
          seedErr instanceof Error ? seedErr.message : seedErr,
        );
      }
    }

    /* Sync and distil now, behind the redirect.
     *
     * Connecting a source used only to save the row and wait for the half-hour
     * cron. So a new account connected the thing that was supposed to fill the
     * map and then looked at an empty landscape for up to thirty minutes, and
     * at raw items with no conclusions for up to thirty more — which is the
     * exact first impression the fan was built to replace.
     *
     * Not awaited before the redirect. A first GitHub sync can run ten seconds
     * or more and the person is sitting in front of a blank tab waiting for it;
     * waitUntil keeps the work alive after the response goes out, so they land
     * on the app while it fills behind them.
     *
     * Every failure is swallowed on purpose. This is a convenience on top of a
     * connection that already succeeded — the cron will do it anyway, and
     * turning a working connection into an error page because a first sync was
     * slow would be a worse product than waiting.
     */
    const firstPass = saved?.id ? (async () => {
      try {
        const { data: fresh } = await admin
          .from("source_connections")
          .select("id, user_id, provider, access_token_encrypted, refresh_token_encrypted, status, last_synced_at")
          .eq("id", saved.id)
          .maybeSingle();
        if (!fresh) return;
        const synced = await syncOneConnection(admin, fresh);
        if (!synced.ok) {
          console.log(`oauth-callback: first sync did not run — ${synced.error}`);
          return;
        }
        const { written, read } = await distillForUser(admin, userId);
        console.log(
          `oauth-callback: first pass ${provider} — ${synced.synced} stored, ${read} read, ${written} concluded`,
        );
      } catch (passErr) {
        console.error(
          "oauth-callback: first pass failed",
          passErr instanceof Error ? passErr.message : passErr,
        );
      }
    })() : null;

    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (firstPass && rt?.waitUntil) rt.waitUntil(firstPass);

    return redirectToApp(`/?facet=connections&connected=${provider}`);
  } catch (err) {
    // Every failure in this block used to come back as "token_exchange_failed",
    // database writes and encryption included, which hid the actual cause.
    console.error("oauth-callback error", err);
    const reason = err instanceof Error ? err.message : String(err);
    return redirectToApp(`/?facet=connections&error=${encodeURIComponent(reason.slice(0, 180))}`);
  }
});
