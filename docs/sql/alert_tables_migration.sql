-- Run manually in Supabase SQL Editor (one transaction).
BEGIN;

-- ─── alert_settings: one row per subscriber ──────────────────────────
CREATE TABLE alert_settings (
  subscriber_id uuid PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
  email_digest_enabled boolean NOT NULL DEFAULT true,
  sms_realtime_enabled boolean NOT NULL DEFAULT false,
  trigger_complaints boolean NOT NULL DEFAULT true,
  trigger_violations boolean NOT NULL DEFAULT true,
  trigger_permits boolean NOT NULL DEFAULT true,
  trigger_stop_work boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── alert_recipients: 1-3 per (subscriber, channel) ─────────────────
CREATE TABLE alert_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  address text NOT NULL,
  position int NOT NULL CHECK (position BETWEEN 1 AND 3),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, channel, position)
);

CREATE INDEX idx_alert_recipients_subscriber_channel
  ON alert_recipients (subscriber_id, channel);

-- ─── alert_digest_log: record every send for idempotency + debugging ─
CREATE TABLE alert_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  digest_date date NOT NULL,
  recipients text[] NOT NULL,
  events_count int NOT NULL DEFAULT 0,
  event_summary jsonb,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped_no_events')),
  error_message text
);

CREATE INDEX idx_alert_digest_log_subscriber_date
  ON alert_digest_log (subscriber_id, digest_date DESC);

CREATE UNIQUE INDEX idx_alert_digest_log_dedupe
  ON alert_digest_log (subscriber_id, digest_date)
  WHERE status = 'sent';

-- ─── Seed alert_settings for all existing subscribers ────────────────
INSERT INTO alert_settings (subscriber_id)
SELECT id FROM subscribers
ON CONFLICT (subscriber_id) DO NOTHING;

-- ─── Seed default email recipient (primary email) for each subscriber
INSERT INTO alert_recipients (subscriber_id, channel, address, position, verified)
SELECT id, 'email', email, 1, true
FROM subscribers
WHERE email IS NOT NULL AND email != ''
ON CONFLICT (subscriber_id, channel, position) DO NOTHING;

COMMIT;
