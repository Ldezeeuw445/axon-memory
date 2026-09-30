alter table public.memory_items
  add column if not exists origin_key text;

comment on column public.memory_items.origin_key is
  'Normalised source id — a provider (gmail, github, ...) or an adapter key (anthropic, openai, ...). Written at insert; see supabase/functions/_shared/adapters.ts.';

update public.memory_items
set origin_key = case
  when metadata->>'remembered_via' ~* 'cursor' then 'cursor'
  when metadata->>'remembered_via' ~* 'perplexity' then 'perplexity'
  when metadata->>'remembered_via' ~* '\ygrok\y|\yxai\y' then 'grok'
  when metadata->>'remembered_via' ~* 'gemini|bard' then 'gemini'
  when metadata->>'remembered_via' ~* 'claude|anthropic' then 'anthropic'
  when metadata->>'remembered_via' ~* 'chatgpt|openai|\ygpt\y' then 'openai'
  else source_type
end
where origin_key is null;

create index if not exists memory_items_user_origin_idx
  on public.memory_items (user_id, origin_key);

create index if not exists memory_facts_source_items_idx
  on public.memory_facts using gin (source_item_ids);

create or replace view public.memory_facts_by_source
with (security_invoker = on) as
  select
    f.user_id,
    i.origin_key as source_id,
    f.category,
    count(distinct f.id) as fact_count,
    count(distinct i.id) as item_count
  from public.memory_facts f
  join public.memory_items i on i.id = any (f.source_item_ids)
  where f.superseded_at is null
    and i.origin_key is not null
  group by f.user_id, i.origin_key, f.category;

comment on view public.memory_facts_by_source is
  'Conclusions per summit per category. A fact counts toward every source that contributed to it.';
