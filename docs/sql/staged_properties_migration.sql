-- staged_properties: pre-checkout staging queue for the onboarding/activation flow.
--
-- The address-page "Add" button inserts here with ONE click (no modal). Rows are
-- a fat snapshot of the full save payload the address page already computes, so
-- promoting a row into portfolio_properties is a pure column copy — no re-resolution.
--
-- Lifecycle:
--   staged           → sitting in the dashboard queue, editable (units, property_name)
--   pending_checkout → user clicked "Save to portfolio", Stripe Checkout session created
--   promoted         → checkout.session.completed webhook copied the row into
--                      portfolio_properties (or an already-entitled user committed directly)
-- Abandoned checkouts revert pending_checkout → staged.
--
-- Access: service-role only via API routes (RLS enabled, zero policies),
-- matching portfolio_properties.
--
-- Run in the Supabase SQL editor BEFORE deploying the onboarding-flow branch.

create table public.staged_properties (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null,

  -- identity (what the user staged)
  canonical_address text not null,
  slug text not null,
  property_name text,                 -- pre-filled from address client-side, editable in queue
  units integer check (units is null or units > 0),  -- self-reported; nullable until entered

  -- snapshot of the full save payload, so promotion = row copy
  address_range text,
  additional_streets text[],
  pins text[],
  sqft integer,
  year_built text,
  implied_value numeric,
  community_area text,
  property_class text,

  -- lifecycle for webhook-driven promotion
  status text not null default 'staged'
    check (status in ('staged', 'pending_checkout', 'promoted')),
  checkout_session_id text,           -- stamped when sent to checkout; webhook promotes by this
  promoted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clerk_id, canonical_address)
);

create index staged_properties_clerk_id_idx
  on public.staged_properties (clerk_id);

create index staged_properties_checkout_idx
  on public.staged_properties (checkout_session_id)
  where checkout_session_id is not null;

alter table public.staged_properties enable row level security;
-- No policies on purpose: service-role-only access via API routes.
