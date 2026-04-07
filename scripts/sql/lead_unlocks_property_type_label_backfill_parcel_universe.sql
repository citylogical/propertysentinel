-- Recompute property_type_label from parcel_universe (not properties.property_class).
-- Step 1: clear prior "unknown" so rows can be re-filled.
UPDATE lead_unlocks SET property_type_label = NULL WHERE property_type_label = 'unknown';

-- Step 2: dominant class per address (latest class per PIN, then majority at address; EX dropped if other classes exist).
WITH pin_latest_class AS (
  SELECT DISTINCT ON (pu.pin)
    pu.pin,
    pu.class
  FROM parcel_universe pu
  WHERE pu.pin IN (SELECT DISTINCT pin FROM properties WHERE pin IS NOT NULL)
  ORDER BY pu.pin, pu.tax_year DESC NULLS LAST
),
addr_pin_class AS (
  SELECT p.address_normalized, p.pin, plc.class
  FROM properties p
  INNER JOIN pin_latest_class plc ON plc.pin = p.pin
),
addr_class_counts AS (
  SELECT
    address_normalized,
    UPPER(TRIM(class)) AS class,
    COUNT(*) AS cnt
  FROM addr_pin_class
  WHERE class IS NOT NULL AND TRIM(class) <> ''
  GROUP BY address_normalized, UPPER(TRIM(class))
),
ranked AS (
  SELECT
    address_normalized,
    class,
    cnt,
    ROW_NUMBER() OVER (
      PARTITION BY address_normalized
      ORDER BY
        CASE
          WHEN class = 'EX' AND EXISTS (
            SELECT 1
            FROM addr_class_counts c2
            WHERE c2.address_normalized = addr_class_counts.address_normalized
              AND c2.class <> 'EX'
          )
            THEN 1
          ELSE 0
        END,
        cnt DESC
    ) AS rn
  FROM addr_class_counts
),
dominant AS (
  SELECT
    r.address_normalized,
    r.class AS dominant_class,
    (SELECT COUNT(*)::int FROM properties p2 WHERE p2.address_normalized = r.address_normalized) AS pin_count
  FROM ranked r
  WHERE r.rn = 1
)
UPDATE lead_unlocks lu
SET property_type_label = CASE
  WHEN d.dominant_class IS NULL THEN 'unknown'
  WHEN d.dominant_class = 'EX' THEN 'exempt'
  WHEN d.dominant_class ~ '^4' THEN 'exempt'
  WHEN d.dominant_class ~ '^[5678]' THEN 'commercial'
  WHEN d.dominant_class ~ '^3' THEN 'apartment'
  WHEN d.dominant_class = '299' AND COALESCE(d.pin_count, 0) >= 7 THEN 'condo_building'
  WHEN d.dominant_class = '299' THEN 'condo_unit'
  WHEN d.dominant_class ~ '^2' THEN 'residential'
  ELSE 'unknown'
END
FROM dominant d
WHERE lu.address_normalized = d.address_normalized
  AND lu.property_type_label IS NULL;

-- Spot check:
-- SELECT address_normalized, property_type_label FROM lead_unlocks ORDER BY created_at DESC LIMIT 20;
