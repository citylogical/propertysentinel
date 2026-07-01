/**
 * lib/sr-catalog.ts
 *
 * SINGLE SOURCE OF TRUTH (TypeScript side) for enrichable CHI311 SR types.
 *
 * Consolidates knowledge that was previously duplicated across:
 *   - app/api/complaints/enrich-on-demand/route.ts  (QUESTION_MAP, SKIP_IDS, ENRICH_CODES)
 *   - lib/aura-enrich.ts                            (QUESTION_MAP, SKIP_IDS)
 *   - components/ComplaintRowEnriched.tsx           (ENRICHABLE_SR_SHORT_CODES chevron gating)
 *   - app/dashboard/details/ComplaintDetail.tsx     (SR_INTAKE_LABELS)
 *   - app/api/cron/daily-digest/route.ts            (SR_INTAKE_LABELS inline duplicate)
 *
 * Every consumer should derive its slice from CATALOG via the exported helpers
 * at the bottom (ENRICH_CODES, PORTFOLIO_ONLY_CODES, SKIP_PARAPHRASE,
 * QUESTION_MAP_BY_WORKTYPE, SR_INTAKE_LABELS, SKIP_IDS, isEnrichableCode).
 * Editing this one file updates all of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CROSS-REPO SYNC (NOT enforced here):
 * The Python worker (property-sentinel-workers/enrich_complaints.py) carries its
 * OWN copy of QUESTION_MAP / ENRICH_CODES / PORTFOLIO_ONLY_CODES / SKIP_PARAPHRASE
 * / SKIP_IDS. That worker is the ingest-time source of truth and lives in a
 * separate repo. This file is the SERVE-time (TS) source of truth. The two must
 * be kept in sync MANUALLY — nothing checks them against each other. When adding
 * a code or changing a question_id here, mirror it in the worker (and vice versa).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LABEL / KIND VERIFICATION:
 * `labelVerified: true` means the label text and field `kind` were confirmed
 * against real enriched values in complaints_311 (distinct-value sampling, Jun
 * 2026). `labelVerified: false` (or absent) means the entry is derived from the
 * worker's question-text comments and NOT yet confirmed against live data — the
 * comments have been wrong before (WM3's description field). Consumers may render
 * unverified labels, but treat them as provisional; confirm against a live
 * complaint before trusting. Grep `labelVerified: false` for the punch-list.
 */

// ── Field kinds ──────────────────────────────────────────────────────────────
// freeform    → complainant prose. Safe to paraphrase; NEVER promote a raw
//               freeform value to a public tag (it can contain PII/narrative).
// picklist    → single fixed-vocabulary choice ("Alley", "Curbline"). Safe to
//               show as a labeled tag.
// yesno       → Yes / No / Don't Know. Safe to show as a labeled tag.
// multiselect → pipe-delimited multi-choice ("A|B|C"). Safe to tag, but the
//               renderer should split on '|' for display.
export type FieldKind = 'freeform' | 'picklist' | 'yesno' | 'multiselect'

// The complaints_311 column an intake answer lands in.
export type IntakeColumn =
  | 'complaint_description' // note: mapped from the 'description' question field
  | 'concern_category'
  | 'problem_category'
  | 'complainant_type'
  | 'unit_number'
  | 'danger_reported'
  | 'owner_notified'
  | 'owner_occupied'
  | 'restaurant_name'
  | 'business_name'

// One intake question for a code.
export type IntakeField = {
  // The logical field name used in QUESTION_MAP (matches the worker's keys:
  // 'description', 'concern_category', 'problem_category', etc.). 'description'
  // is the odd one out — it maps to the complaint_description column.
  field: string
  // Salesforce question Id (Aura flex-answer lookup).
  questionId: string
  // Which complaints_311 column the answer is stored in.
  column: IntakeColumn
  // Human label for UI/digest. Absent → consumers fall back to generic labels.
  label?: string
  // Value shape (drives promote-to-tag safety + paraphrase reasoning).
  kind: FieldKind
}

export type SrCatalogEntry = {
  srShortCode: string
  srType: string          // human-readable SR type name
  workTypeId: string      // Salesforce WorkType Id (keys the worker's QUESTION_MAP)
  department: string      // handling department (for "Handled by")
  portfolioOnly: boolean  // enriched only at portfolio addresses, not citywide
  paraphrase: boolean     // false = SKIP_PARAPHRASE (structured intake, no narrative)
  labelVerified: boolean  // labels + kinds confirmed against live data (Jun 2026)
  fields: IntakeField[]
}

// Convenience for the many DWM / S&S departments.
const DWM = 'DWM – Department of Water Management'
const SS = 'Streets and Sanitation'
const BUILDINGS = 'Buildings'
const BACP = 'Business Affairs and Consumer Protection'
const CDPH = 'Public Health'
const ACC = 'Animal Care and Control'
const CFD = 'Fire'
const CDOT = 'Transportation'

// ── The catalog ──────────────────────────────────────────────────────────────
// Ordered roughly by domain: building → business → water/HVAC/fire → DWM triage
// → animal → S&S. WorkType IDs and question IDs transcribed verbatim from the
// worker's QUESTION_MAP (authoritative). Labels/kinds verified against the
// Jun 2026 distinct-value sample except where labelVerified: false.
export const CATALOG: SrCatalogEntry[] = [
  // ── Building ────────────────────────────────────────────────────────────────
  {
    srShortCode: 'BBA', srType: 'Building Violation', workTypeId: '08qt0000000CabpAAC',
    department: BUILDINGS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000LfxuEAC', column: 'complaint_description', label: 'Problem', kind: 'freeform' },
      { field: 'complainant_type', questionId: 'a1Yt0000000Lg7FEAS', column: 'complainant_type', label: 'Filed by', kind: 'picklist' },
      { field: 'unit_number', questionId: 'a1Yt0000000Lg6cEAC', column: 'unit_number', label: 'Unit', kind: 'freeform' },
      { field: 'danger_reported', questionId: 'a1Yt0000000Lg6uEAC', column: 'danger_reported', label: 'Danger', kind: 'yesno' },
      { field: 'owner_notified', questionId: 'a1Yt0000000Lg72EAC', column: 'owner_notified', label: 'Owner notified', kind: 'yesno' },
      { field: 'owner_occupied', questionId: 'a1Yt0000000Lg73EAC', column: 'owner_occupied', label: 'Owner occupied', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'BBC', srType: 'Plumbing Violation', workTypeId: '08qt0000000CabrAAC',
    department: BUILDINGS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000LjBVEA0', column: 'complaint_description', label: 'Problem', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'BBD', srType: 'No Permit / Construction Violation', workTypeId: '08qt0000000CacJAAS',
    department: BUILDINGS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000Lg7IEAS', column: 'complaint_description', label: 'Work described', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000Lg7iEAC', column: 'concern_category', label: 'Nature of violation', kind: 'picklist' },
      { field: 'unit_number', questionId: 'a1Yt0000000Lg7JEAS', column: 'unit_number', label: 'Location of work', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'BBK', srType: 'Vacant/Abandoned Building', workTypeId: '08qt0000000CacgAAC',
    department: BUILDINGS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000Lg4aEAC', column: 'complaint_description', label: 'Problem', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'BPI', srType: 'Porch Inspection', workTypeId: '08qt0000000CacoAAC',
    department: BUILDINGS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000Lg9sEAC', column: 'complaint_description', label: 'Problem', kind: 'freeform' },
      { field: 'complainant_type', questionId: 'a1Yt0000000LgA6EAK', column: 'complainant_type', label: 'Filed by', kind: 'picklist' },
      { field: 'owner_notified', questionId: 'a1Yt0000000Lg9xEAC', column: 'owner_notified', label: 'Owner notified', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'HDF', srType: 'Lead Inspection', workTypeId: '08qt0000000CaYeAAK',
    department: CDPH, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000Lj2IEAS', column: 'complaint_description', label: 'Request', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'SCB', srType: 'Sanitation Code Violation', workTypeId: '08qt0000000CacaAAC',
    department: SS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000LirDEAS', column: 'complaint_description', label: 'Violation', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LfjBEAS', column: 'concern_category', label: 'Debris', kind: 'freeform' },
    ],
  },

  // ── Restaurant / Business ───────────────────────────────────────────────────
  {
    srShortCode: 'HFB', srType: 'Restaurant Complaint', workTypeId: '08qt0000000CaYiAAK',
    department: CDPH, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'restaurant_name', questionId: 'a1Yt0000000Lj1JEAS', column: 'restaurant_name', label: 'Restaurant', kind: 'freeform' },
      { field: 'description', questionId: 'a1Yt0000000Lj1IEAS', column: 'complaint_description', label: 'Problem', kind: 'freeform' },
      { field: 'problem_category', questionId: 'a1Yt0000000LimCEAS', column: 'problem_category', label: 'Problem type', kind: 'picklist' },
      { field: 'unit_number', questionId: 'a1Yt0000000Lj1HEAS', column: 'unit_number', label: 'Floor/room', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'RBL', srType: 'Business Complaint', workTypeId: '08qt0000000CacSAAS',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000cCDfEAM', column: 'business_name', label: 'Business', kind: 'freeform' },
      { field: 'description', questionId: 'a1Y8z0000006zcCEAQ', column: 'complaint_description', label: 'Issue', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Y8z0000006xYHEAY', column: 'concern_category', label: 'Nature of complaint', kind: 'picklist' },
    ],
  },
  {
    srShortCode: 'CAFE', srType: 'Sidewalk Cafe / Outdoor Dining', workTypeId: '08qt0000000CadBAAS',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000cCDpEAM', column: 'business_name', label: 'Business', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Y8z00000075hxEAA', column: 'concern_category', label: 'Issue type', kind: 'multiselect' },
      { field: 'description', questionId: 'a1Y8z00000075i7EAA', column: 'complaint_description', label: 'Detail', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'CORNVEND', srType: 'Pushcart Food Vendor', workTypeId: '08qt0000000CadIAAS',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000Lj4dEAC', column: 'business_name', label: 'Business', kind: 'freeform' },
      { field: 'description', questionId: 'a1Yt0000000Lj4cEAC', column: 'complaint_description', label: 'Problem', kind: 'freeform' },
      { field: 'unit_number', questionId: 'a1Yt0000000Lj4bEAC', column: 'unit_number', label: 'Location', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'SHVR', srType: 'Shared Housing / Vacation Rental', workTypeId: '08qt0000000CaexAAC',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'complainant_type', questionId: 'a1Yt0000000LihQEAS', column: 'complainant_type', label: 'Filed by', kind: 'picklist' },
      { field: 'concern_category', questionId: 'a1Yt0000000LihREAS', column: 'concern_category', label: 'Concerns', kind: 'multiselect' },
      { field: 'description', questionId: 'a1Yt0000000LiubEAC', column: 'complaint_description', label: 'Detail', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'CSF', srType: 'Consumer Fraud', workTypeId: '08qt0000000CadNAAS',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000LiSJEA0', column: 'concern_category', label: 'Complaint type', kind: 'picklist' },
      { field: 'description', questionId: 'a1Yt0000000Lj2AEAS', column: 'complaint_description', label: 'Amount paid', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'CST', srType: 'Consumer Retail Business', workTypeId: '08qt0000000CaeeAAC',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000cCDVEA2', column: 'business_name', label: 'Business', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LiY6EAK', column: 'concern_category', label: 'Nature of complaint', kind: 'picklist' },
      { field: 'description', questionId: 'a1Yt0000000Lj8XEAS', column: 'complaint_description', label: 'Merchandise/service', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'BAG', srType: 'Tobacco – General', workTypeId: '08qt0000000Cac2AAC',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000LjCkEAK', column: 'business_name', label: 'Business', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LifFEAS', column: 'concern_category', label: 'Violation types', kind: 'multiselect' },
      { field: 'description', questionId: 'a1Yt0000000LjCmEAK', column: 'complaint_description', label: 'Detail', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'BAM', srType: 'Tobacco – Sale to Minors', workTypeId: '08qt0000000Cab5AAC',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000LjCgEAK', column: 'business_name', label: 'Business', kind: 'freeform' },
      { field: 'description', questionId: 'a1Yt0000000LjCjEAK', column: 'complaint_description', label: 'What you saw', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'FPC', srType: 'Inaccurate Fuel Pump', workTypeId: '08qt0000000CaXQAA0',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000cCDaEAM', column: 'business_name', label: 'Station', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LiRsEAK', column: 'concern_category', label: 'Issue type', kind: 'picklist' },
      { field: 'description', questionId: 'a1Yt0000000LjBxEAK', column: 'complaint_description', label: 'How detected', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'ODM', srType: 'Outdated Merchandise', workTypeId: '08qt0000000CaaoAAC',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Yt0000000cCDkEAM', column: 'business_name', label: 'Business', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LiNKEA0', column: 'concern_category', label: 'Type of food', kind: 'multiselect' },
      { field: 'description', questionId: 'a1Yt0000000Lix4EAC', column: 'complaint_description', label: 'Brand', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'MWC', srType: 'Wage Complaint', workTypeId: '08qt0000000CaaLAAS',
    department: BACP, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'business_name', questionId: 'a1Ycs000002sErFEAU', column: 'business_name', label: 'Company', kind: 'freeform' },
    ],
  },

  // ── Water / HVAC / Fire ─────────────────────────────────────────────────────
  {
    srShortCode: 'AAF', srType: 'Water in Basement Complaint', workTypeId: '08qt0000000CabOAAS',
    department: DWM, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000LiYfEAK', column: 'concern_category', label: 'Water receded?', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000000Li1dEAC', column: 'problem_category', label: 'Water clarity', kind: 'picklist' },
      { field: 'description', questionId: 'a1Yt0000000LjFoEAK', column: 'complaint_description', label: 'Inches of water', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'NAC', srType: 'No Air Conditioning', workTypeId: '08q8z0000000LkrAAE',
    department: BUILDINGS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Y8z0000000ZLKEA2', column: 'complaint_description', label: 'Duration without AC', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Y8z0000000ZL5EAM', column: 'concern_category', label: 'Senior living facility?', kind: 'yesno' },
      { field: 'problem_category', questionId: 'a1Y8z0000000ZLPEA2', column: 'problem_category', label: 'Units impacted', kind: 'freeform' },
      { field: 'owner_notified', questionId: 'a1Y8z0000000ZLFEA2', column: 'owner_notified', label: 'Owner contacted', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'WBJ', srType: 'No Water Complaint', workTypeId: '08qt0000000CaYtAAK',
    department: DWM, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000LiIyEAK', column: 'concern_category', label: 'Cause', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000000LiCMEA0', column: 'problem_category', label: 'Due to a leak?', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'WBK', srType: 'Low Water Pressure Complaint', workTypeId: '08qt0000000CaaFAAS',
    department: DWM, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000Lit1EAC', column: 'complaint_description', label: 'Pressure (highest floor)', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000Lit2EAC', column: 'concern_category', label: 'Pressure (basement)', kind: 'freeform' },
      { field: 'problem_category', questionId: 'a1Yt0000000LiANEA0', column: 'problem_category', label: 'Open hydrants nearby?', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'FAC', srType: 'Commercial Fire Safety Inspection', workTypeId: '08qt0000000CaXPAA0',
    department: CFD, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000003OLaCEAW', column: 'concern_category', label: 'Property type', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000003OLaMEAW', column: 'problem_category', label: 'Nature of problem', kind: 'picklist' },
    ],
  },
  {
    srShortCode: 'WCA', srType: 'Water Quality Concern', workTypeId: '08qt0000000CaZ9AAK',
    department: DWM, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000LfS9EAK', column: 'complaint_description', label: 'Detail', kind: 'freeform' },
    ],
  },

  // ── DWM triage (structured, no paraphrase) ──────────────────────────────────
  {
    srShortCode: 'WM3', srType: 'Check for Leak', workTypeId: '08qt0000000CaZYAA0',
    department: DWM, portfolioOnly: false, paraphrase: false, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000LiLEEA0', column: 'concern_category', label: 'Leak location', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000000LiAFEA0', column: 'problem_category', label: 'Leak visible', kind: 'yesno' },
      // description column holds a bare Yes/No whose QUESTION is unconfirmed
      // (worker comment said "can you hear noise from pipes" but that's not
      // certain). Left unlabeled so it is NOT promoted to a tag. UNVERIFIED.
      { field: 'description', questionId: 'a1Yt0000000LiooEAC', column: 'complaint_description', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'AAD', srType: 'Sewer Cave-In Inspection', workTypeId: '08qt0000000CabMAAS',
    department: DWM, portfolioOnly: false, paraphrase: false, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000LiH6EAK', column: 'concern_category', label: 'Cave-in location', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000000Li2NEAS', column: 'problem_category', label: 'Sewer structure nearby', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'AAI', srType: 'Alley Sewer Inspection', workTypeId: '08qt0000000CabQAAS',
    department: DWM, portfolioOnly: false, paraphrase: false, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000Li2KEAS', column: 'concern_category', label: 'Alley caved-in', kind: 'yesno' },
      { field: 'problem_category', questionId: 'a1Yt0000000Li2LEAS', column: 'problem_category', label: 'Alley flooded', kind: 'yesno' },
      { field: 'description', questionId: 'a1Yt0000000LiYjEAK', column: 'complaint_description', label: 'Surface', kind: 'picklist' },
    ],
  },

  // ── Animal ──────────────────────────────────────────────────────────────────
  {
    srShortCode: 'EAF', srType: 'Vicious Animal Complaint', workTypeId: '08qt0000000CafkAAC',
    department: ACC, portfolioOnly: true, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000003XDTYEA4', column: 'concern_category', label: 'Animal location', kind: 'multiselect' },
      // problem_category is a picklist but sometimes carries a freeform tail
      // appended with " | " ("Other (non-bite) | ***ROAMING PLAYGROUND...**").
      // Classified picklist; renderer may want to trim after " | ".
      { field: 'problem_category', questionId: 'a1Yt0000000Li5WEAS', column: 'problem_category', label: 'Aggressive actions', kind: 'multiselect' },
      { field: 'description', questionId: 'a1Yt0000000LiytEAC', column: 'complaint_description', label: 'Animal described', kind: 'freeform' },
      // owner_occupied overloaded: "animal resides at address" — landlord-
      // liability signal, surfaced specially in ComplaintDetail for EAF.
      { field: 'owner_occupied', questionId: 'a1Yt0000000Li00EAC', column: 'owner_occupied', label: 'Animal resides at address', kind: 'yesno' },
    ],
  },

  // ── Streets & Sanitation ────────────────────────────────────────────────────
  {
    srShortCode: 'SDR', srType: 'Fly Dumping', workTypeId: '08qt0000000Cad6AAC',
    department: SS, portfolioOnly: false, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000Liv8EAC', column: 'complaint_description', label: 'Debris', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LiPQEA0', column: 'concern_category', label: 'Location', kind: 'picklist' },
    ],
  },
  {
    srShortCode: 'SGA', srType: 'Rodent Baiting / Rat Complaint', workTypeId: '08qt0000000CaeTAAS',
    department: SS, portfolioOnly: true, paraphrase: false, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000Li1rEAC', column: 'concern_category', label: 'Locations to bait', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000000cAhrEAE', column: 'problem_category', label: 'Backyard service', kind: 'picklist' },
    ],
  },
  {
    srShortCode: 'SEC', srType: 'Tree Emergency', workTypeId: '08qt0000000CadSAAS',
    department: SS, portfolioOnly: true, paraphrase: true, labelVerified: true,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000000LiaTEAS', column: 'concern_category', label: 'Obstructing', kind: 'picklist' },
      // problem_category is nominally "actual location of tree" but the live
      // data shows it's freeform ("In the rear of the house, hanging on a
      // line..."), not a clean picklist. Classified freeform.
      { field: 'problem_category', questionId: 'a1Yt0000000LfQ3EAK', column: 'problem_category', label: 'Tree location', kind: 'freeform' },
      { field: 'description', questionId: 'a1Yt0000000LivfEAC', column: 'complaint_description', label: 'Situation', kind: 'freeform' },
    ],
  },
  {
    // RFC has no QUESTION_MAP fields — WOLI-only, static standard_description
    // written by the worker. Included so it's a known enrichable code, but has
    // no intake fields to label.
    srShortCode: 'RFC', srType: 'Renters & Foreclosure', workTypeId: '',
    department: BUILDINGS, portfolioOnly: false, paraphrase: false, labelVerified: true,
    fields: [],
  },

  // ── S&S / water portfolio-only (Jun 2026) ───────────────────────────────────
  // These had zero enriched rows at verification time (SCP had 1), so their
  // labels/kinds are comment-derived and UNVERIFIED. Confirm against live data
  // once volume accrues, then flip labelVerified.
  {
    srShortCode: 'WCA3', srType: 'Water Lead Test Visit', workTypeId: '08qt0000000CaXEAA0',
    department: DWM, portfolioOnly: true, paraphrase: false, labelVerified: false,
    fields: [
      { field: 'danger_reported', questionId: 'a1Yt0000000Lh7cEAC', column: 'danger_reported', label: 'Pregnant / child under 6', kind: 'yesno' },
    ],
  },
  {
    srShortCode: 'SCX', srType: 'Recycling Inspection', workTypeId: '08qt0000000CacyAAC',
    department: SS, portfolioOnly: true, paraphrase: true, labelVerified: false,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000Liw3EAC', column: 'complaint_description', label: 'Non-compliance', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LfrmEAC', column: 'concern_category', label: 'Property type', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000000LiLWEA0', column: 'problem_category', label: 'Existing recycling program', kind: 'picklist' },
    ],
  },
  {
    srShortCode: 'SCT', srType: 'Clean Vacant Lot', workTypeId: '08qt0000000CacwAAC',
    department: SS, portfolioOnly: true, paraphrase: true, labelVerified: false,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000LivoEAC', column: 'complaint_description', label: 'What needs cleaning', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000LivnEAC', column: 'concern_category', label: 'Size of area', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'SCP', srType: 'Weed Removal', workTypeId: '08qt0000000CabDAAS',
    department: SS, portfolioOnly: true, paraphrase: true, labelVerified: false,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000LioSEAS', column: 'complaint_description', label: 'Comment', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000Li5aEAC', column: 'concern_category', label: 'Weed location', kind: 'picklist' },
      { field: 'problem_category', questionId: 'a1Yt0000000LioQEAS', column: 'problem_category', label: 'Weed height', kind: 'freeform' },
    ],
  },
  {
    srShortCode: 'SWSNOREM', srType: 'Snow / Uncleared Sidewalk', workTypeId: '08qt0000000CafSAAS',
    department: SS, portfolioOnly: true, paraphrase: true, labelVerified: false,
    fields: [
      { field: 'description', questionId: 'a1Yt0000000LiuKEAS', column: 'complaint_description', label: 'Area described', kind: 'freeform' },
      { field: 'concern_category', questionId: 'a1Yt0000000Li4TEAS', column: 'concern_category', label: 'Unshoveled area', kind: 'picklist' },
    ],
  },
  {
    srShortCode: 'SCSP', srType: 'Shared Cost Sidewalk Program', workTypeId: '08qt00000004DUhAAM',
    department: CDOT, portfolioOnly: true, paraphrase: false, labelVerified: false,
    fields: [
      { field: 'concern_category', questionId: 'a1Yt0000003GAJqEAO', column: 'concern_category', label: 'Replacement requested', kind: 'picklist' },
    ],
  },
]

// ── SKIP_IDS — question IDs to never store (PII / low-signal) ─────────────────
// Mirrors the worker's SKIP_IDS. Kept as a flat set; the enrichment routes use
// it to drop these answers even though they're never mapped to a column.
export const SKIP_IDS = new Set<string>([
  'a1Yt0000000Lg6SEAS', // BBA phone
  'a1Yt0000000Lg7HEAS', // BBD phone
  'a1Yt0000000Lg4YEAS', // BBK phone
  'a1Yt0000000Lg5pEAC', // BPI phone
  'a1Yt0000000Lj2HEAS', // HDF phone/name (PII)
  'a1Yt0000000LiJeEAK', // WBJ best time to reach
  'a1Y8z0000000ZLUEA2', // NAC mechanical equipment / contractor info
  'a1Yt0000000LiJaEAK', // WM3 best time to reach
  'a1Yt0000000LiLsEAK', // AAD best time to reach
  'a1Yt0000000LiJlEAK', // AAI best time to reach
  'a1Yt0000000LiM0EAK', // WM3 "if yes location"
  'a1Yt0000000LiLuEAK', // AAD "construction nearby"
  'a1Yt0000000Li2MEAS', // AAI "missing lid"
  'a1Yt0000000Li2JEAS', // AAI "someone pumping"
  'a1Yt0000000LiJ8EAK', // SEC "street blocked?"
  'a1Yt0000000LiaQEAS', // SEC "what part of tree is down?"
  'a1Yt0000000LiJDEA0', // SDR witness?
  'a1Yt0000000LiJEEA0', // SDR witness report for reward?
  'a1Yt0000003GWzqEAG', // WCA3 scheduling acknowledgment
  'a1Yt0000003GAJlEAO', // SCSP disabled/senior (PII-adjacent)
  'a1Yt0000003PcMeEAK', // SCSP bill delivery method
])

// ── Derived exports (compute once at module load) ────────────────────────────

const _byCode = new Map<string, SrCatalogEntry>()
const _byWorkType = new Map<string, SrCatalogEntry>()
for (const e of CATALOG) {
  _byCode.set(e.srShortCode, e)
  if (e.workTypeId) _byWorkType.set(e.workTypeId, e)
}

/** All enrichable SR short codes. Replaces ENRICHABLE_SR_SHORT_CODES + ENRICH_CODES. */
export const ENRICH_CODES: ReadonlySet<string> = new Set(CATALOG.map((e) => e.srShortCode))

/** Codes enriched only at portfolio addresses. Replaces PORTFOLIO_ONLY_CODES. */
export const PORTFOLIO_ONLY_CODES: ReadonlySet<string> = new Set(
  CATALOG.filter((e) => e.portfolioOnly).map((e) => e.srShortCode),
)

/** Codes where paraphrase is skipped (structured intake). Replaces SKIP_PARAPHRASE. */
export const SKIP_PARAPHRASE: ReadonlySet<string> = new Set(
  CATALOG.filter((e) => !e.paraphrase).map((e) => e.srShortCode),
)

/**
 * WorkType Id → { field: questionId }. Reproduces the shape the enrichment
 * routes expect (matches the worker's QUESTION_MAP), derived from the catalog.
 */
export const QUESTION_MAP_BY_WORKTYPE: Record<string, Record<string, string>> = (() => {
  const out: Record<string, Record<string, string>> = {}
  for (const e of CATALOG) {
    if (!e.workTypeId || e.fields.length === 0) continue
    const m: Record<string, string> = {}
    for (const f of e.fields) m[f.field] = f.questionId
    out[e.workTypeId] = m
  }
  return out
})()

/**
 * SR short code → { concern?, problem?, description? } human labels.
 * Replaces SR_INTAKE_LABELS in ComplaintDetail.tsx and daily-digest/route.ts.
 * Only fields with a label AND a non-freeform-promotable meaning are included:
 *   - concern  ← concern_category field's label
 *   - problem  ← problem_category field's label
 *   - description ← the 'description' field's label, but ONLY when its kind is
 *     NOT freeform (so AAI "Surface" is promotable; WM3/SEC freeform desc is not)
 * This preserves the exact safety rule established in the modal + digest work.
 */
export const SR_INTAKE_LABELS: Record<
  string,
  { concern?: string; problem?: string; description?: string }
> = (() => {
    const out: Record<string, { concern?: string; problem?: string; description?: string }> = {}
    for (const e of CATALOG) {
      const entry: { concern?: string; problem?: string; description?: string } = {}
      for (const f of e.fields) {
        // Blanket safety rule: a freeform field NEVER becomes a label tag, no
        // matter which column it lands in. A freeform value is prose, not a
        // category — promoting it produces mislabeled tags like SCB "Debris:
        // Cardboard, broken chairs, plastic bags" or NAC "Units impacted: 140
        // units". Freeform surfaces via paraphrase or the admin raw-quote only.
        if (f.kind === 'freeform') continue
        if (f.column === 'concern_category' && f.label) entry.concern = f.label
        else if (f.column === 'problem_category' && f.label) entry.problem = f.label
        else if (f.field === 'description' && f.column === 'complaint_description' && f.label) {
          entry.description = f.label
        }
      }
      if (entry.concern || entry.problem || entry.description) out[e.srShortCode] = entry
    }
    return out
})()

/** Lookup helpers. */
export function getCatalogEntry(srShortCode: string | null | undefined): SrCatalogEntry | null {
  if (!srShortCode) return null
  return _byCode.get(srShortCode.trim().toUpperCase()) ?? null
}
export function getCatalogEntryByWorkType(workTypeId: string | null | undefined): SrCatalogEntry | null {
  if (!workTypeId) return null
  return _byWorkType.get(workTypeId) ?? null
}
export function isEnrichableCode(srShortCode: string | null | undefined): boolean {
  if (!srShortCode) return false
  return ENRICH_CODES.has(srShortCode.trim().toUpperCase())
}