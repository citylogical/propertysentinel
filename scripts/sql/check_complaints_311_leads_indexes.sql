-- Run in Supabase SQL editor before adding idx_complaints_shortcode_created_desc.sql.
-- Paste results back to confirm no duplicate composite on (sr_short_code, created_date DESC).

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'complaints_311'
  AND (indexdef ILIKE '%sr_short_code%' OR indexdef ILIKE '%created_date%');
