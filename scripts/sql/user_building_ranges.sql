-- Run in Supabase SQL Editor. If migrating from the previous schema, DROP TABLE user_building_ranges CASCADE; first (data loss).

CREATE TABLE user_building_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text,
  searched_address text NOT NULL,
  street1_range text NOT NULL,
  street2_range text,
  street3_range text,
  street4_range text,
  street1_low text,
  street1_high text,
  street2_low text,
  street2_high text,
  street3_low text,
  street3_high text,
  street4_low text,
  street4_high text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ubr_status ON user_building_ranges(status);
CREATE INDEX idx_ubr_user ON user_building_ranges(user_id);
