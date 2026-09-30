-- "Never send my mail to Cursor."
--
-- Until now recall was all or nothing: an assistant connected to an account
-- could read everything in it. That is the objection that ends a sales
-- conversation, and it is a fair one — somebody willing to connect their code
-- may still not want their mailbox travelling to a coding tool.
--
-- One row is one refusal: this app does not get this source. Keyed on the
-- adapter rather than on a registration, because the person thinks "Cursor",
-- not "the Cursor I registered on 12 August" — three registrations of one app
-- are one decision, and making them three would be a setting nobody keeps
-- straight.
--
-- source_type and not origin_key: the axis is where a memory CAME FROM, which
-- is what somebody is protecting. A memory Claude wrote about a mail is not
-- the mail.
create table if not exists public.recall_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  adapter_key text not null,
  source_type text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, adapter_key, source_type)
);
comment on table public.recall_rules is
  'One row = one refusal: this assistant may not be handed memories from this source. Absence means allowed, so an account with no rules behaves exactly as before.';
create index if not exists recall_rules_lookup_idx
  on public.recall_rules (user_id, adapter_key);
alter table public.recall_rules enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recall_rules' and policyname = 'recall_rules_own'
  ) then
    create policy recall_rules_own on public.recall_rules
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
