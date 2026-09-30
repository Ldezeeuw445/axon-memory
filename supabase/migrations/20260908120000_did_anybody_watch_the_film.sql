-- The most expensive thing on the landing page is the one thing nobody measures.
--
-- Twelve shots, a 408vh scroll track and 1.2 MB of JavaScript, and no way to
-- know whether a visitor reaches shot 12 or leaves during shot 02. Three other
-- tasks on this list — does the film open on black (F1), are twelve captions
-- readable in four screens of scroll (F5), is the reduced-motion visitor being
-- dragged through a film anyway (F6) — are each currently a guess.
--
-- One row per watch answers all three, so that is what this is: not a stream of
-- events, one row written once when the tab goes away, carrying how far they
-- got and how long each shot held the screen.
--
-- What is deliberately NOT in this table: no IP address, no user agent, no
-- referrer, no cookie, no identifier that survives the tab being closed. The
-- session id is generated in memory and dies with the page. This measures the
-- film, not the person watching it — which is also the only kind of measurement
-- a product whose entire pitch is "your memory stays yours" can honestly ship.

create table if not exists public.landing_film_watch (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- The furthest shot index reached (0-based), and the one on screen when they
  -- left. They differ when somebody scrolls back up, which is itself a signal.
  deepest_shot smallint not null,
  left_at_shot smallint not null,

  -- Milliseconds each shot held the screen, index-aligned with SHOTS. This is
  -- the F5 answer: a caption nobody had two seconds in front of was not read.
  shot_ms      integer[] not null default '{}',
  total_ms     integer not null default 0,

  -- The two conditions that change what the film even is.
  reduced_motion boolean not null default false,
  viewport       text not null default 'desktop'
    check (viewport in ('phone', 'desktop')),
  viewport_w     smallint,

  -- Which build said this. A drop after a deploy should be attributable.
  release        text
);
comment on table public.landing_film_watch is
  'One row per landing-page film watch. Anonymous by construction: no IP, no user agent, no cookie, no identifier outliving the tab.';
create index if not exists landing_film_watch_created_idx
  on public.landing_film_watch (created_at desc);
-- Nobody reads this table from a browser. The edge function writes it with the
-- service role; RLS on with no policy at all is a deny for every other caller,
-- which is the correct default for a table an unauthenticated endpoint feeds.
alter table public.landing_film_watch enable row level security;
-- How far the film actually gets, by day and by screen.
--
-- Written as a view because the question is never "show me the rows" — it is
-- "did shot 02 lose them", and that has to be one query somebody will actually
-- run rather than a join they have to remember.
create or replace view public.landing_film_reach
with (security_invoker = on) as
select
  created_at::date                                      as day,
  viewport,
  reduced_motion,
  count(*)::bigint                                      as watches,
  round(avg(deepest_shot)::numeric, 1)                  as avg_deepest,
  count(*) filter (where deepest_shot >= 11)::bigint    as reached_the_end,
  count(*) filter (where deepest_shot <= 1)::bigint     as left_in_the_opening,
  round(avg(total_ms) / 1000.0, 1)                      as avg_seconds
from public.landing_film_watch
group by 1, 2, 3;
comment on view public.landing_film_reach is
  'Landing film, by day and screen: how far people get, how many reach shot 12, how many leave in the first two shots.';
