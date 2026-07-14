-- Run manually in Supabase SQL Editor (2026-07-13).
--
-- 1. New alert_settings rows default the empty-day "all clear" digest to OFF.
--    Must stay in sync with defaultSettings() in
--    app/api/cron/daily-digest/route.ts, which applies the same defaults when
--    no alert_settings row exists.
ALTER TABLE alert_settings
ALTER COLUMN email_digest_send_when_empty SET DEFAULT false;

-- 2. Flip existing rows to OFF, but only for subscribers created in the last
--    24 hours (the 2026-07-13 signup wave). Older accounts — Jim's accounts
--    and the anchor customer — keep whatever they have. Most of the new
--    signups have no alert_settings row at all (the row is only created on a
--    Settings-tab visit), so this may update few or zero rows; the cron's
--    missing-row defaults cover the rest.
UPDATE alert_settings
SET email_digest_send_when_empty = false,
    updated_at = now()
WHERE email_digest_send_when_empty = true
  AND subscriber_id IN (
    SELECT id FROM subscribers
    WHERE created_at > now() - interval '24 hours'
  );
