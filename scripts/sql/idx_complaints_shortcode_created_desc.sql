-- Leads query: sr_short_code IN (...) AND created_date >= ... ORDER BY created_date DESC
-- Only create if check_complaints_311_leads_indexes.sql shows no suitable composite.
-- CONCURRENTLY avoids blocking writes; cannot run inside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_shortcode_created_desc
  ON public.complaints_311 (sr_short_code, created_date DESC);
