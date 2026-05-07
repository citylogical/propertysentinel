-- Run in Supabase SQL editor when deploying dashboard portfolio stats updates.
ALTER TABLE portfolio_properties
  ADD COLUMN IF NOT EXISTS open_building_complaints INTEGER,
  ADD COLUMN IF NOT EXISTS total_building_complaints_12mo INTEGER;
