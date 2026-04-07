-- Backfill property_type_label for existing unlocks.
-- Uses the same rule order as lib/property-type.ts.
WITH unlock_props AS (
  SELECT
    lu.id AS unlock_id,
    lu.address_normalized,
    p.property_class
  FROM lead_unlocks lu
  LEFT JOIN LATERAL (
    SELECT property_class
    FROM properties
    WHERE address_normalized = lu.address_normalized
    LIMIT 1
  ) p ON true
),
pin_counts AS (
  SELECT
    address_normalized,
    COUNT(*) AS pin_count
  FROM properties
  WHERE address_normalized IN (SELECT address_normalized FROM unlock_props WHERE property_class = '299')
  GROUP BY address_normalized
)
UPDATE lead_unlocks lu
SET property_type_label = CASE
  WHEN up.property_class IS NULL OR TRIM(up.property_class) = '' THEN 'unknown'
  WHEN up.property_class ~ '^4' THEN 'exempt'
  WHEN up.property_class ~ '^[5678]' THEN 'commercial'
  WHEN up.property_class ~ '^3' THEN 'apartment'
  WHEN up.property_class = '299' AND COALESCE(pc.pin_count, 0) >= 7 THEN 'condo_building'
  WHEN up.property_class = '299' THEN 'condo_unit'
  WHEN up.property_class ~ '^2' THEN 'residential'
  ELSE 'unknown'
END
FROM unlock_props up
LEFT JOIN pin_counts pc ON pc.address_normalized = up.address_normalized
WHERE lu.id = up.unlock_id
  AND lu.property_type_label IS NULL;

-- Sanity check:
-- SELECT address_normalized, property_type_label FROM lead_unlocks ORDER BY created_at DESC LIMIT 10;
