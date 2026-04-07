-- Backfill v2: suppress entity_mailing_name when Tracerfy returned a person
-- whose mailing matches the property (Option B land trust suppression).
WITH unlock_props AS (
  SELECT
    lu.id AS unlock_id,
    lu.address_normalized,
    lu.all_persons,
    p.property_class,
    p.mailing_name
  FROM lead_unlocks lu
  LEFT JOIN LATERAL (
    SELECT property_class, mailing_name
    FROM properties
    WHERE address_normalized = lu.address_normalized
    LIMIT 1
  ) p ON true
),
multi_owner AS (
  SELECT
    address_normalized,
    COUNT(*) AS pin_count,
    COUNT(DISTINCT UPPER(TRIM(COALESCE(mailing_name, '')))) FILTER (WHERE mailing_name IS NOT NULL AND TRIM(mailing_name) <> '') AS distinct_names
  FROM properties
  WHERE address_normalized IN (SELECT address_normalized FROM unlock_props)
  GROUP BY address_normalized
),
clean_match AS (
  SELECT
    unlock_id,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(all_persons, '[]'::jsonb)) AS person
      WHERE (person->>'mailing_matches_property')::boolean = true
    ) AS has_clean_residential_match
  FROM unlock_props
)
UPDATE lead_unlocks lu
SET
  business_trace_recommended = CASE
    WHEN up.property_class ~ '^4' THEN true
    WHEN up.property_class ~ '^[35678]' THEN true
    WHEN up.mailing_name ~* '\m(LLC|L\.L\.C\.|LP|LLP|LTD|INC|INCORPORATED|CORP|CORPORATION|COMPANY|TRUST|TRUSTEE|TRUSTEES|ASSOCIATION|ASSN|CONDOMINIUM|CONDO|HOA|COOP|COOPERATIVE|MANAGEMENT|MGMT|PROPERTIES|REALTY|HOLDINGS|PARTNERS|PARTNERSHIP|FUND|GROUP|SERVICES|ENTERPRISES|BANK|CHURCH|PARISH|MINISTRIES|ARCHDIOCESE|DIOCESE|FOUNDATION|INSTITUTE|UNIVERSITY|COLLEGE|SCHOOL|HOSPITAL|AUTHORITY)\M'
         AND NOT cm.has_clean_residential_match THEN true
    WHEN mo.pin_count >= 7 AND mo.distinct_names >= 2 THEN true
    ELSE false
  END,
  business_trace_reason = CASE
    WHEN up.property_class ~ '^4' THEN 'exempt_class'
    WHEN up.property_class ~ '^[35678]' THEN 'commercial_class'
    WHEN up.mailing_name ~* '\m(LLC|L\.L\.C\.|LP|LLP|LTD|INC|INCORPORATED|CORP|CORPORATION|COMPANY|TRUST|TRUSTEE|TRUSTEES|ASSOCIATION|ASSN|CONDOMINIUM|CONDO|HOA|COOP|COOPERATIVE|MANAGEMENT|MGMT|PROPERTIES|REALTY|HOLDINGS|PARTNERS|PARTNERSHIP|FUND|GROUP|SERVICES|ENTERPRISES|BANK|CHURCH|PARISH|MINISTRIES|ARCHDIOCESE|DIOCESE|FOUNDATION|INSTITUTE|UNIVERSITY|COLLEGE|SCHOOL|HOSPITAL|AUTHORITY)\M'
         AND NOT cm.has_clean_residential_match THEN 'entity_mailing_name'
    WHEN mo.pin_count >= 7 AND mo.distinct_names >= 2 THEN 'multi_owner_building'
    ELSE NULL
  END
FROM unlock_props up
LEFT JOIN multi_owner mo ON mo.address_normalized = up.address_normalized
LEFT JOIN clean_match cm ON cm.unlock_id = up.unlock_id
WHERE lu.id = up.unlock_id;

-- Sanity check (example):
-- SELECT address_normalized, business_trace_recommended, business_trace_reason
-- FROM lead_unlocks
-- WHERE address_normalized = '6801 W SHAKESPEARE AVE';
