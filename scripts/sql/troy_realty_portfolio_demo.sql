-- ============================================================================
-- Troy Realty portfolio demo — complaint / violation / permit counts
-- Run in the Supabase SQL editor. Two queries below; highlight one and Run.
--
-- Conventions copied from the app so numbers match what the site will show:
--   * 29 SR codes  = OWNER_RELEVANT_CODES (ownerRelevant: true, lib/sr-codes.ts)
--   * open 311     = lower(status) = 'open' AND duplicate IS NOT TRUE
--                    (lib/portfolio-stats.ts — duplicates excluded from open,
--                     kept in totals, same as the dashboard)
--   * open viol    = coalesce(violation_status, inspection_status) OPEN/FAILED
--   * 12mo windows on created_date / violation_date / issue_date
--
-- Addresses are the 98 distinct MLS listings with unit numbers stripped and
-- normalized to the platform form (lib/supabase-search.ts normalizeAddress).
-- A few MLS street names don't match Chicago's canonical names; those rows
-- carry extra lookup variants that roll up to one display_address:
--   * 4343 N CLARENDON  — MLS says "Street", city data uses AVE
--   * 2851 S SAINT LOUIS — datasets vary between SAINT LOUIS / ST LOUIS
--   * 12553 S LOWE       — MLS says "Street", Lowe is an AVE
--   * 10447 S AVE G / 11109 S AVE J — AVENUE sometimes spelled out
--   * 740 W FULTON       — likely FULTON MARKET at that address
--   * 1516 W DIVERSEY    — PKWY east of the river; MLS said Avenue
--   * 7450 S EUCLID      — MLS says "Parkway"; canonical street is AVE
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- QUERY 1 — one row per property, sorted by 12-month owner-relevant complaints
-- ────────────────────────────────────────────────────────────────────────────
WITH targets (display_address, lookup_address) AS (
  VALUES
    ('130 N GARLAND CT',        '130 N GARLAND CT'),
    ('1464 S MICHIGAN AVE',     '1464 S MICHIGAN AVE'),
    ('4343 N CLARENDON ST',     '4343 N CLARENDON ST'),
    ('4343 N CLARENDON ST',     '4343 N CLARENDON AVE'),
    ('360 W ILLINOIS ST',       '360 W ILLINOIS ST'),
    ('9737 S MERRILL AVE',      '9737 S MERRILL AVE'),
    ('2442 W MADISON ST',       '2442 W MADISON ST'),
    ('405 N WABASH AVE',        '405 N WABASH AVE'),
    ('8606 S KOSTNER AVE',      '8606 S KOSTNER AVE'),
    ('4746 N KARLOV AVE',       '4746 N KARLOV AVE'),
    ('4941 N KILDARE AVE',      '4941 N KILDARE AVE'),
    ('10509 S EDBROOKE AVE',    '10509 S EDBROOKE AVE'),
    ('8 W MONROE ST',           '8 W MONROE ST'),
    ('7643 S EBERHART AVE',     '7643 S EBERHART AVE'),
    ('363 E WACKER DR',         '363 E WACKER DR'),
    ('1755 E 55TH ST',          '1755 E 55TH ST'),
    ('3749 N NORA AVE',         '3749 N NORA AVE'),
    ('2851 S SAINT LOUIS AVE',  '2851 S SAINT LOUIS AVE'),
    ('2851 S SAINT LOUIS AVE',  '2851 S ST LOUIS AVE'),
    ('401 E ONTARIO ST',        '401 E ONTARIO ST'),
    ('8801 S CLYDE AVE',        '8801 S CLYDE AVE'),
    ('3750 N LAKE SHORE DR',    '3750 N LAKE SHORE DR'),
    ('235 W VAN BUREN ST',      '235 W VAN BUREN ST'),
    ('1454 N CENTRAL AVE',      '1454 N CENTRAL AVE'),
    ('1748 E 73RD PL',          '1748 E 73RD PL'),
    ('3906 W BELMONT AVE',      '3906 W BELMONT AVE'),
    ('3640 N ARTESIAN AVE',     '3640 N ARTESIAN AVE'),
    ('2228 N SOUTHPORT AVE',    '2228 N SOUTHPORT AVE'),
    ('4036 W WARWICK AVE',      '4036 W WARWICK AVE'),
    ('1668 W EDGEWATER AVE',    '1668 W EDGEWATER AVE'),
    ('1525 N BOSWORTH AVE',     '1525 N BOSWORTH AVE'),
    ('9350 S MANISTEE AVE',     '9350 S MANISTEE AVE'),
    ('3963 W BELMONT AVE',      '3963 W BELMONT AVE'),
    ('2322 S CANAL ST',         '2322 S CANAL ST'),
    ('1255 S STATE ST',         '1255 S STATE ST'),
    ('3123 W CORTLAND ST',      '3123 W CORTLAND ST'),
    ('7801 S EBERHART AVE',     '7801 S EBERHART AVE'),
    ('2430 W GREENLEAF AVE',    '2430 W GREENLEAF AVE'),
    ('450 W BRIAR PL',          '450 W BRIAR PL'),
    ('1400 S MICHIGAN AVE',     '1400 S MICHIGAN AVE'),
    ('30 E HURON ST',           '30 E HURON ST'),
    ('2626 W WILCOX ST',        '2626 W WILCOX ST'),
    ('2623 W EVERGREEN AVE',    '2623 W EVERGREEN AVE'),
    ('1320 W GRENSHAW ST',      '1320 W GRENSHAW ST'),
    ('4140 N PONTIAC AVE',      '4140 N PONTIAC AVE'),
    ('840 E 89TH ST',           '840 E 89TH ST'),
    ('1732 W DIVERSEY PKWY',    '1732 W DIVERSEY PKWY'),
    ('2211 W ROSCOE ST',        '2211 W ROSCOE ST'),
    ('1282 W WASHINGTON BLVD',  '1282 W WASHINGTON BLVD'),
    ('2633 W BELMONT AVE',      '2633 W BELMONT AVE'),
    ('910 S MICHIGAN AVE',      '910 S MICHIGAN AVE'),
    ('1841 N CALIFORNIA AVE',   '1841 N CALIFORNIA AVE'),
    ('2719 W HADDON AVE',       '2719 W HADDON AVE'),
    ('811 S LYTLE ST',          '811 S LYTLE ST'),
    ('5818 W BYRON ST',         '5818 W BYRON ST'),
    ('3440 N LAKE SHORE DR',    '3440 N LAKE SHORE DR'),
    ('7206 W WELLINGTON AVE',   '7206 W WELLINGTON AVE'),
    ('1029 N HONORE ST',        '1029 N HONORE ST'),
    ('1425 W FULLERTON AVE',    '1425 W FULLERTON AVE'),
    ('3532 N OZARK AVE',        '3532 N OZARK AVE'),
    ('12553 S LOWE ST',         '12553 S LOWE ST'),
    ('12553 S LOWE ST',         '12553 S LOWE AVE'),
    ('2034 W POTOMAC AVE',      '2034 W POTOMAC AVE'),
    ('757 N ORLEANS ST',        '757 N ORLEANS ST'),
    ('923 W IRVING PARK RD',    '923 W IRVING PARK RD'),
    ('234 W POLK ST',           '234 W POLK ST'),
    ('1634 W SURF ST',          '1634 W SURF ST'),
    ('815 N MILWAUKEE AVE',     '815 N MILWAUKEE AVE'),
    ('950 N MICHIGAN AVE',      '950 N MICHIGAN AVE'),
    ('10447 S AVE G',           '10447 S AVE G'),
    ('10447 S AVE G',           '10447 S AVENUE G'),
    ('6452 N BELL AVE',         '6452 N BELL AVE'),
    ('11109 S AVE J',           '11109 S AVE J'),
    ('11109 S AVE J',           '11109 S AVENUE J'),
    ('5515 S OAKLEY AVE',       '5515 S OAKLEY AVE'),
    ('929 W EASTWOOD AVE',      '929 W EASTWOOD AVE'),
    ('10553 S CALUMET AVE',     '10553 S CALUMET AVE'),
    ('640 W BARRY AVE',         '640 W BARRY AVE'),
    ('933 W VAN BUREN ST',      '933 W VAN BUREN ST'),
    ('222 E PEARSON ST',        '222 E PEARSON ST'),
    ('12238 S ABERDEEN ST',     '12238 S ABERDEEN ST'),
    ('1650 W DIVISION ST',      '1650 W DIVISION ST'),
    ('740 W FULTON ST',         '740 W FULTON ST'),
    ('740 W FULTON ST',         '740 W FULTON MARKET'),
    ('2728 N HAMPDEN CT',       '2728 N HAMPDEN CT'),
    ('6952 W SUMMERDALE AVE',   '6952 W SUMMERDALE AVE'),
    ('5422 S SAYRE AVE',        '5422 S SAYRE AVE'),
    ('10122 S LUELLA AVE',      '10122 S LUELLA AVE'),
    ('1516 W DIVERSEY PKWY',    '1516 W DIVERSEY PKWY'),
    ('1516 W DIVERSEY PKWY',    '1516 W DIVERSEY AVE'),
    ('2152 W AINSLIE ST',       '2152 W AINSLIE ST'),
    ('5412 S NATOMA AVE',       '5412 S NATOMA AVE'),
    ('5919 N BERNARD ST',       '5919 N BERNARD ST'),
    ('4250 N MARINE DR',        '4250 N MARINE DR'),
    ('6843 S CARPENTER ST',     '6843 S CARPENTER ST'),
    ('5006 N WESTERN AVE',      '5006 N WESTERN AVE'),
    ('10 E ONTARIO ST',         '10 E ONTARIO ST'),
    ('111 S MORGAN ST',         '111 S MORGAN ST'),
    ('7450 S EUCLID PKWY',      '7450 S EUCLID PKWY'),
    ('7450 S EUCLID PKWY',      '7450 S EUCLID AVE'),
    ('1300 N CLEAVER ST',       '1300 N CLEAVER ST'),
    ('480 N MCCLURG CT',        '480 N MCCLURG CT'),
    ('11241 S CENTRAL PARK AVE','11241 S CENTRAL PARK AVE'),
    ('2832 W WILCOX ST',        '2832 W WILCOX ST'),
    ('431 S DEARBORN ST',       '431 S DEARBORN ST'),
    ('1410 W HURON ST',         '1410 W HURON ST')
),

-- The 29 owner-relevant SR codes (OWNER_RELEVANT_CODES, lib/sr-codes.ts)
owner_relevant_codes (code) AS (
  VALUES
    ('BBA'), ('BBC'), ('BBD'), ('BBK'), ('BPI'), ('FAC'), ('HDF'),
    ('SCB'), ('SHVR'), ('NAC'), ('AAF'), ('WCA2'), ('WCA3'), ('WM3'),
    ('WBJ'), ('WBK'), ('WCA'), ('RFC'), ('EAF'), ('SCT'), ('SCX'),
    ('SGA'), ('SCP'), ('SDR'), ('AAD'), ('AAI'), ('SCSP'),
    ('SWSNOREM'), ('SEC')
),

complaint_stats AS (
  SELECT
    t.display_address,
    COUNT(*) FILTER (WHERE c.created_date >= now() - INTERVAL '12 months') AS complaints_12mo,
    COUNT(*)                                                              AS complaints_total,
    COUNT(*) FILTER (
      WHERE lower(c.status) = 'open' AND c.duplicate IS NOT TRUE
    )                                                                     AS open_complaints,
    MAX(c.created_date)::date                                             AS latest_complaint
  FROM targets t
  JOIN complaints_311 c ON c.address_normalized = t.lookup_address
  JOIN owner_relevant_codes oc ON upper(c.sr_short_code) = oc.code
  GROUP BY 1
),

violation_stats AS (
  SELECT
    t.display_address,
    COUNT(*) FILTER (WHERE v.violation_date >= now() - INTERVAL '12 months') AS violations_12mo,
    COUNT(*)                                                                 AS violations_total,
    COUNT(*) FILTER (
      WHERE upper(coalesce(v.violation_status, v.inspection_status, '')) IN ('OPEN', 'FAILED')
    )                                                                        AS open_violations
  FROM targets t
  JOIN violations v ON v.address_normalized = t.lookup_address
  GROUP BY 1
),

permit_stats AS (
  SELECT
    t.display_address,
    COUNT(*) FILTER (WHERE p.issue_date >= now() - INTERVAL '12 months') AS permits_12mo,
    COUNT(*)                                                             AS permits_total
  FROM targets t
  JOIN permits p ON p.address_normalized = t.lookup_address
  GROUP BY 1
)

SELECT
  props.display_address,
  COALESCE(cs.complaints_12mo, 0)   AS complaints_12mo,
  COALESCE(cs.complaints_total, 0)  AS complaints_total,
  COALESCE(cs.open_complaints, 0)   AS open_complaints,
  cs.latest_complaint,
  COALESCE(vs.violations_12mo, 0)   AS violations_12mo,
  COALESCE(vs.violations_total, 0)  AS violations_total,
  COALESCE(vs.open_violations, 0)   AS open_violations,
  COALESCE(ps.permits_12mo, 0)      AS permits_12mo,
  COALESCE(ps.permits_total, 0)     AS permits_total
FROM (SELECT DISTINCT display_address FROM targets) props
LEFT JOIN complaint_stats cs USING (display_address)
LEFT JOIN violation_stats vs USING (display_address)
LEFT JOIN permit_stats  ps USING (display_address)
ORDER BY complaints_12mo DESC, complaints_total DESC, display_address;


-- ────────────────────────────────────────────────────────────────────────────
-- QUERY 2 (optional drill-down) — the individual recent complaints behind the
-- counts, newest first. Self-contained: highlight from here down and Run.
-- ────────────────────────────────────────────────────────────────────────────
WITH targets (display_address, lookup_address) AS (
  VALUES
    ('130 N GARLAND CT',        '130 N GARLAND CT'),
    ('1464 S MICHIGAN AVE',     '1464 S MICHIGAN AVE'),
    ('4343 N CLARENDON ST',     '4343 N CLARENDON ST'),
    ('4343 N CLARENDON ST',     '4343 N CLARENDON AVE'),
    ('360 W ILLINOIS ST',       '360 W ILLINOIS ST'),
    ('9737 S MERRILL AVE',      '9737 S MERRILL AVE'),
    ('2442 W MADISON ST',       '2442 W MADISON ST'),
    ('405 N WABASH AVE',        '405 N WABASH AVE'),
    ('8606 S KOSTNER AVE',      '8606 S KOSTNER AVE'),
    ('4746 N KARLOV AVE',       '4746 N KARLOV AVE'),
    ('4941 N KILDARE AVE',      '4941 N KILDARE AVE'),
    ('10509 S EDBROOKE AVE',    '10509 S EDBROOKE AVE'),
    ('8 W MONROE ST',           '8 W MONROE ST'),
    ('7643 S EBERHART AVE',     '7643 S EBERHART AVE'),
    ('363 E WACKER DR',         '363 E WACKER DR'),
    ('1755 E 55TH ST',          '1755 E 55TH ST'),
    ('3749 N NORA AVE',         '3749 N NORA AVE'),
    ('2851 S SAINT LOUIS AVE',  '2851 S SAINT LOUIS AVE'),
    ('2851 S SAINT LOUIS AVE',  '2851 S ST LOUIS AVE'),
    ('401 E ONTARIO ST',        '401 E ONTARIO ST'),
    ('8801 S CLYDE AVE',        '8801 S CLYDE AVE'),
    ('3750 N LAKE SHORE DR',    '3750 N LAKE SHORE DR'),
    ('235 W VAN BUREN ST',      '235 W VAN BUREN ST'),
    ('1454 N CENTRAL AVE',      '1454 N CENTRAL AVE'),
    ('1748 E 73RD PL',          '1748 E 73RD PL'),
    ('3906 W BELMONT AVE',      '3906 W BELMONT AVE'),
    ('3640 N ARTESIAN AVE',     '3640 N ARTESIAN AVE'),
    ('2228 N SOUTHPORT AVE',    '2228 N SOUTHPORT AVE'),
    ('4036 W WARWICK AVE',      '4036 W WARWICK AVE'),
    ('1668 W EDGEWATER AVE',    '1668 W EDGEWATER AVE'),
    ('1525 N BOSWORTH AVE',     '1525 N BOSWORTH AVE'),
    ('9350 S MANISTEE AVE',     '9350 S MANISTEE AVE'),
    ('3963 W BELMONT AVE',      '3963 W BELMONT AVE'),
    ('2322 S CANAL ST',         '2322 S CANAL ST'),
    ('1255 S STATE ST',         '1255 S STATE ST'),
    ('3123 W CORTLAND ST',      '3123 W CORTLAND ST'),
    ('7801 S EBERHART AVE',     '7801 S EBERHART AVE'),
    ('2430 W GREENLEAF AVE',    '2430 W GREENLEAF AVE'),
    ('450 W BRIAR PL',          '450 W BRIAR PL'),
    ('1400 S MICHIGAN AVE',     '1400 S MICHIGAN AVE'),
    ('30 E HURON ST',           '30 E HURON ST'),
    ('2626 W WILCOX ST',        '2626 W WILCOX ST'),
    ('2623 W EVERGREEN AVE',    '2623 W EVERGREEN AVE'),
    ('1320 W GRENSHAW ST',      '1320 W GRENSHAW ST'),
    ('4140 N PONTIAC AVE',      '4140 N PONTIAC AVE'),
    ('840 E 89TH ST',           '840 E 89TH ST'),
    ('1732 W DIVERSEY PKWY',    '1732 W DIVERSEY PKWY'),
    ('2211 W ROSCOE ST',        '2211 W ROSCOE ST'),
    ('1282 W WASHINGTON BLVD',  '1282 W WASHINGTON BLVD'),
    ('2633 W BELMONT AVE',      '2633 W BELMONT AVE'),
    ('910 S MICHIGAN AVE',      '910 S MICHIGAN AVE'),
    ('1841 N CALIFORNIA AVE',   '1841 N CALIFORNIA AVE'),
    ('2719 W HADDON AVE',       '2719 W HADDON AVE'),
    ('811 S LYTLE ST',          '811 S LYTLE ST'),
    ('5818 W BYRON ST',         '5818 W BYRON ST'),
    ('3440 N LAKE SHORE DR',    '3440 N LAKE SHORE DR'),
    ('7206 W WELLINGTON AVE',   '7206 W WELLINGTON AVE'),
    ('1029 N HONORE ST',        '1029 N HONORE ST'),
    ('1425 W FULLERTON AVE',    '1425 W FULLERTON AVE'),
    ('3532 N OZARK AVE',        '3532 N OZARK AVE'),
    ('12553 S LOWE ST',         '12553 S LOWE ST'),
    ('12553 S LOWE ST',         '12553 S LOWE AVE'),
    ('2034 W POTOMAC AVE',      '2034 W POTOMAC AVE'),
    ('757 N ORLEANS ST',        '757 N ORLEANS ST'),
    ('923 W IRVING PARK RD',    '923 W IRVING PARK RD'),
    ('234 W POLK ST',           '234 W POLK ST'),
    ('1634 W SURF ST',          '1634 W SURF ST'),
    ('815 N MILWAUKEE AVE',     '815 N MILWAUKEE AVE'),
    ('950 N MICHIGAN AVE',      '950 N MICHIGAN AVE'),
    ('10447 S AVE G',           '10447 S AVE G'),
    ('10447 S AVE G',           '10447 S AVENUE G'),
    ('6452 N BELL AVE',         '6452 N BELL AVE'),
    ('11109 S AVE J',           '11109 S AVE J'),
    ('11109 S AVE J',           '11109 S AVENUE J'),
    ('5515 S OAKLEY AVE',       '5515 S OAKLEY AVE'),
    ('929 W EASTWOOD AVE',      '929 W EASTWOOD AVE'),
    ('10553 S CALUMET AVE',     '10553 S CALUMET AVE'),
    ('640 W BARRY AVE',         '640 W BARRY AVE'),
    ('933 W VAN BUREN ST',      '933 W VAN BUREN ST'),
    ('222 E PEARSON ST',        '222 E PEARSON ST'),
    ('12238 S ABERDEEN ST',     '12238 S ABERDEEN ST'),
    ('1650 W DIVISION ST',      '1650 W DIVISION ST'),
    ('740 W FULTON ST',         '740 W FULTON ST'),
    ('740 W FULTON ST',         '740 W FULTON MARKET'),
    ('2728 N HAMPDEN CT',       '2728 N HAMPDEN CT'),
    ('6952 W SUMMERDALE AVE',   '6952 W SUMMERDALE AVE'),
    ('5422 S SAYRE AVE',        '5422 S SAYRE AVE'),
    ('10122 S LUELLA AVE',      '10122 S LUELLA AVE'),
    ('1516 W DIVERSEY PKWY',    '1516 W DIVERSEY PKWY'),
    ('1516 W DIVERSEY PKWY',    '1516 W DIVERSEY AVE'),
    ('2152 W AINSLIE ST',       '2152 W AINSLIE ST'),
    ('5412 S NATOMA AVE',       '5412 S NATOMA AVE'),
    ('5919 N BERNARD ST',       '5919 N BERNARD ST'),
    ('4250 N MARINE DR',        '4250 N MARINE DR'),
    ('6843 S CARPENTER ST',     '6843 S CARPENTER ST'),
    ('5006 N WESTERN AVE',      '5006 N WESTERN AVE'),
    ('10 E ONTARIO ST',         '10 E ONTARIO ST'),
    ('111 S MORGAN ST',         '111 S MORGAN ST'),
    ('7450 S EUCLID PKWY',      '7450 S EUCLID PKWY'),
    ('7450 S EUCLID PKWY',      '7450 S EUCLID AVE'),
    ('1300 N CLEAVER ST',       '1300 N CLEAVER ST'),
    ('480 N MCCLURG CT',        '480 N MCCLURG CT'),
    ('11241 S CENTRAL PARK AVE','11241 S CENTRAL PARK AVE'),
    ('2832 W WILCOX ST',        '2832 W WILCOX ST'),
    ('431 S DEARBORN ST',       '431 S DEARBORN ST'),
    ('1410 W HURON ST',         '1410 W HURON ST')
),
owner_relevant_codes (code) AS (
  VALUES
    ('BBA'), ('BBC'), ('BBD'), ('BBK'), ('BPI'), ('FAC'), ('HDF'),
    ('SCB'), ('SHVR'), ('NAC'), ('AAF'), ('WCA2'), ('WCA3'), ('WM3'),
    ('WBJ'), ('WBK'), ('WCA'), ('RFC'), ('EAF'), ('SCT'), ('SCX'),
    ('SGA'), ('SCP'), ('SDR'), ('AAD'), ('AAI'), ('SCSP'),
    ('SWSNOREM'), ('SEC')
)
SELECT
  t.display_address,
  c.created_date::date AS created,
  c.sr_number,
  c.sr_short_code,
  c.sr_type,
  c.status,
  c.duplicate
FROM targets t
JOIN complaints_311 c ON c.address_normalized = t.lookup_address
JOIN owner_relevant_codes oc ON upper(c.sr_short_code) = oc.code
WHERE c.created_date >= now() - INTERVAL '12 months'
ORDER BY c.created_date DESC;
