-- Run manually in Supabase SQL Editor (additive migration).

ALTER TABLE alert_settings
ADD COLUMN IF NOT EXISTS email_digest_send_when_empty boolean NOT NULL DEFAULT true;
