-- Run in Supabase SQL editor once. Enables building complaint snapshots on audits.
ALTER TABLE portfolio_audit_properties
  ADD COLUMN IF NOT EXISTS open_building_complaints INTEGER,
  ADD COLUMN IF NOT EXISTS total_building_complaints_12mo INTEGER;
