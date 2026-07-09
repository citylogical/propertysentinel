-- plan_unit_cap: the unit ceiling of the subscriber's current Portfolio band
-- (10/20/40/100/225/375/550), written by the Stripe webhook from the price
-- lookup_key (tierN_monthly / tierN_yearly). NULL for enterprise, admin,
-- basic, and lapsed accounts. Used by the staging queue to show remaining
-- capacity instead of a plan recommendation for existing subscribers.
--
-- Run in the Supabase SQL editor before deploying the plan-aware queue.

alter table public.subscribers
  add column if not exists plan_unit_cap integer;
