-- Two new columns on lead_unlocks for the business-trace recommendation.
-- Computed at unlock time and surfaced in the Unlocked Leads UI as a CTA banner.
ALTER TABLE public.lead_unlocks
  ADD COLUMN IF NOT EXISTS business_trace_recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_trace_reason text;
-- Reason values: commercial_class, exempt_class, entity_mailing_name, multi_owner_building.
-- NULL when recommended is false.
