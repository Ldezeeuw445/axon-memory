-- profiles.plan is not the plan.
--
-- Entitlement is plan_tier, resolved through user_plan_status and plan_features.
-- profiles.plan is an older column that nothing reads any more: no view, no
-- policy, no function, and no line of application code. It still holds a value,
-- though, and the value is stale — an account on lifetime_founder reads 'free'
-- here. Anyone who opens this table to answer "what plan is this person on"
-- gets a confident wrong answer, which has already happened once.
--
-- Left in place rather than dropped: dropping a column is not reversible and
-- there is no hurry. A comment is enough to stop the next person believing it.
comment on column public.profiles.plan is
  'VESTIGIAL — not the source of truth and not maintained. Entitlement is profiles.plan_tier, resolved via public.user_plan_status and plan_features. Values here are stale; do not read this column.';
