-- Run in Supabase SQL editor before relying on prefix LIKE on permits.address_normalized.
-- Plain btree does not serve LIKE 'foo%'; text_pattern_ops enables btree prefix scans.

CREATE INDEX IF NOT EXISTS idx_permits_addr_norm_pattern
  ON public.permits USING btree (address_normalized text_pattern_ops);
