-- A5-5: OAuth access-token expiry + rotating refresh tokens. Additive only.
--
-- Every existing row keeps NULL in all four columns, which means "no expiry"
-- (grandfathered): tokens already handed to Claude, ChatGPT, Cursor and
-- personal keys keep working until revoked. Only grants issued after this
-- migration get an expiry and a refresh token.
alter table public.api_keys
  add column if not exists access_expires_at timestamptz,
  add column if not exists refresh_token_hash text,
  add column if not exists refresh_expires_at timestamptz,
  add column if not exists refreshed_at timestamptz;

comment on column public.api_keys.access_expires_at is 'NULL = no expiry (personal keys, and OAuth tokens issued before A5-5).';
comment on column public.api_keys.refresh_token_hash is 'sha256 of the current refresh token (OAuth only). Rotated on every use.';

create unique index if not exists api_keys_refresh_token_hash_key
  on public.api_keys (refresh_token_hash) where refresh_token_hash is not null;

-- Like key_hash, the refresh hash is a sha256 of a 256-bit random token: an
-- owner can read their own row (RLS api_keys_all_own) but the hash is not
-- reversible, and no other tenant can see it.
