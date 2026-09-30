-- Every call to action on the landing page opens the same door: sign in, choose
-- a plan, experience AXON. A visitor who wants this in a month has nowhere to
-- put themselves down, so they leave no trace and we never hear from them
-- again. That is also the shape of the launch blocker underneath it — ten
-- people who are not Luka needs a list of people you can ask.
--
-- One address and the date it arrived. Nothing else.
--
-- ## Why this table is deliberately thin
--
-- An email address is personal data and this is an EU company, so every column
-- here has to earn itself against a subject access request and a deletion
-- request. A name nobody asked for, an IP address, a referrer, a "how did you
-- hear about us" — each one is a thing to store, disclose, and delete, in
-- exchange for a marketing report nobody at six accounts is going to read.
--
-- `source` is the exception and it is not tracking: it says which door on the
-- page they came through, so a form that nobody uses can be told apart from a
-- form nobody sees.
--
-- `unsubscribed_at` rather than a delete, because somebody who asks to be taken
-- off a list must not be written back onto it by their own earlier submission
-- arriving twice. A real erasure request deletes the row.

create table if not exists public.landing_interest (
  id              uuid primary key default gen_random_uuid(),
  -- Stored lowercased, and the database is what says so rather than the one
  -- caller that happens to remember. An upsert has to name a real column to
  -- conflict on, so this cannot be a unique index over lower(email): that is
  -- an expression, and PostgREST's on_conflict takes column names.
  email           text not null check (email = lower(email)),
  created_at      timestamptz not null default now(),
  source          text not null default 'landing',
  unsubscribed_at timestamptz
);
comment on table public.landing_interest is
  'People who asked to be told when AXON is ready. One address and a date; no IP, no name, no tracking.';
-- One row per person however many times they press it. Luka@ and luka@ are the
-- same person and two rows would mean two mails; the check above is what makes
-- a plain unique index enough to say so.
create unique index if not exists landing_interest_email_key
  on public.landing_interest (email);
-- Written by an edge function with the service role. RLS on with no policy is
-- a deny for everybody else, which is what a table of other people's email
-- addresses should be.
alter table public.landing_interest enable row level security;
