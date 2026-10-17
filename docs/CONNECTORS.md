# Connector runtime contract (A8-1)

Spec §20: connection status, scope, last successful sync, errors, imported object count, revoke, permission explanation. **Never imply a connector is synchronised when it has failed.**

## Where it lives
- Builder: `supabase/functions/_shared/connectors.ts` (`connectorContract`, `deriveHealth`, `CATALOG`, `revokeAtProvider`).
- App: `GET /functions/v1/connectors` (user JWT) → `{ connectors[], catalog[] }`; `?id=<uuid>` for one.
- Public API: `GET /v1/connectors`, `GET /v1/connectors/{id}` (personal key / OAuth token, read scope is enough).
- Revoke: `POST /functions/v1/disconnect-source { source_connection_id }`.
- UI: `src/pages/DataSources.jsx` (Connections facet).

## Health (derived, not the raw `status` column)
| health | when | synchronized |
|---|---|---|
| healthy | status connected, last success < 3 h ago | **true** |
| pending | connected, never completed a sync | false |
| syncing | status syncing, started < 20 min ago | false |
| stuck | status syncing for > 20 min | false |
| stale | status connected but last success > 3 h ago | false |
| failing | status error (last run failed) | false |
| unsupported | provider has no sync implementation (discord, jira, obsidian, apple_notes, unknown) | false |
| disconnected | revoked; tokens deleted | false |

`synchronized` is true only for `healthy`. Only that state gets the green check in the UI.

## Fields
`id, provider, name, account, status, health, synchronized, supported, summary, connected_at, last_success_at, last_attempt_at, consecutive_failures, error {kind, message, at, action} | null, imported {items, last_run {fetched, stored} | null}, scope {access: read-only, requested[], granted[] | null, explanation, note?}, cursor {kind, value}, provenance {source_type, connection_id, note}, revoke {available, method, manage_url, keeps_imported_memories}`.

- `error.message` is redacted: bearer tokens, provider token prefixes and any 40+ character opaque string become `[redacted]`. Max 300 chars. Kinds: auth, permission, rate_limit, provider, storage, unsupported, unknown.
- `imported.items` = memory_items whose `source_connection_id` is this connection.
- `scope.granted` is recorded from the provider's token response on (re)connect. It is null for connections made before A8-1 or when the provider does not report it. `note` discloses grants broader than what AXON uses (GitHub `repo`, Supabase app permissions).
- `provenance`: every imported memory carries `source.channel = connector`, `source.provider`, `source.account` and `source.connection_id` (see `RECALL.md` / `API.md`). Items are deduplicated per connection by the provider's own id.

## Runtime recording (`_shared/source-sync.ts`)
- Every run sets `last_attempt_at` before anything can fail.
- Success: `status=connected`, `last_synced_at` (= last success, also the GitHub cursor), `last_fetched_count`, `last_stored_count`, `consecutive_failures=0`, `last_error(_at)=null`.
- Failure: `status=error`, `last_error`, `last_error_at`, `consecutive_failures+1`. `last_synced_at` is kept, so the last success stays visible.
- Unsupported provider: fails honestly (`unsupported: … not available yet`) instead of "syncing" nothing and being marked connected.
- `sync-source` refuses a disconnected connection (409), so a deliberate revoke never turns into "failing".
- Reconnect (`oauth-callback`) resets the failure streak, or sets it to 1 when a required scope was not granted.

Rows that existed before A8-1 start with `consecutive_failures = 0` and no `last_attempt_at`. The columns fill in from the next run.

## Revoke
`disconnect-source` deletes AXON's stored tokens and sets `status=disconnected`. Imported memories are kept. Where the provider has a token revocation endpoint (Google: gmail and google_drive; Slack; Linear), the grant is also revoked there, best-effort. The response reports `revoked_at_provider` truthfully, plus `manage_url` when the person has to revoke on the provider's side (GitHub, Notion, Outlook, Supabase). Someone else's connection id returns 404; nothing is touched.

## Tests
- `_shared/connectors.test.ts`: health derivation, synchronized flag, redaction, error kinds, revoke behaviour with a mocked fetch.
- `tests/rls/isolation.sql`: contract columns present, new rows start at 0 failures.
- `scripts/rls-isolation-http.mjs` (22 checks): stuck, unsupported and disconnected are reported honestly. Error, streak, imported count and last run are visible. No token material. Cross-tenant list, get, revoke and sync are refused, and the same holds on `/v1/connectors`. Revoke never claims a provider revoke it did not do. The fixtures use only `syncing` and `disconnected` statuses, so the scheduler never touches them.
