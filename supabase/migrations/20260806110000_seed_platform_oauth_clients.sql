-- Pre-registered OAuth clients for platforms that don't support Dynamic
-- Client Registration (RFC 7591) and instead require whoever builds the
-- integration (any Axon user, in a Custom GPT / Extension builder UI) to
-- paste a fixed Client ID + Client Secret. One shared client per platform is
-- safe multi-tenant OAuth design — the *end user's identity* still comes
-- from their own login + consent during the authorization-code exchange,
-- never from the client credentials themselves.
--
-- ChatGPT Custom GPT Actions mints its own callback URL per GPT instance
-- (https://chat.openai.com/aip/g-<id>/oauth/callback), so the redirect_uri
-- below is a wildcard pattern (see redirectUriAllowed() in _shared/oauth.ts)
-- rather than one exact URI.
--
-- The plaintext secrets are shown to users directly in the AI Adapters page
-- (they are meant to be pasted into ChatGPT's/Google's own builder UI) —
-- only the sha256 hash is ever stored here, same as every other credential
-- in this system.
insert into public.oauth_clients (client_id, client_secret_hash, client_name, client_uri, redirect_uris, is_public, created_via)
values
  (
    'axon-chatgpt-actions',
    '3ab0481184da11eb907cef5141bff9bd2ad0e92c2787eb7ee7392753e9a42890',
    'ChatGPT',
    'https://chatgpt.com',
    array['https://chat.openai.com/aip/*/oauth/callback'],
    false,
    'manual'
  )
on conflict (client_id) do update set
  client_secret_hash = excluded.client_secret_hash,
  redirect_uris = excluded.redirect_uris;

-- Gemini Extensions/Gems do not yet expose an equivalent open third-party
-- OAuth connector mechanism as of this writing, so no client is seeded for
-- it — the AI Adapters page marks Gemini "coming soon" rather than shipping
-- a flow that can't actually complete.
