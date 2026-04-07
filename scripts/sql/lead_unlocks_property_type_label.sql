-- Property type label derived from Cook County class code + PIN count at address.
-- Allowed values: residential, condo_unit, condo_building, apartment, commercial, exempt, unknown.
-- Computed at unlock time and stored so the UI tag renders without joins.
ALTER TABLE public.lead_unlocks
  ADD COLUMN IF NOT EXISTS property_type_label text;
