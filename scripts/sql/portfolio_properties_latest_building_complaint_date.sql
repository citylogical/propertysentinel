-- Run in Supabase SQL Editor (or apply via migration pipeline).
-- Single new column + index for portfolio table sort on latest building complaint.

ALTER TABLE portfolio_properties
ADD COLUMN IF NOT EXISTS latest_building_complaint_date timestamptz;

CREATE INDEX IF NOT EXISTS idx_portfolio_props_latest_bldg_complaint
ON portfolio_properties (user_id, latest_building_complaint_date DESC NULLS LAST);
