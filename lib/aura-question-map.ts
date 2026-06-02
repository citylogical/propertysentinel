/**
 * lib/aura-question-map.ts
 *
 * Shared Salesforce Aura WorkType → field → question ID mappings.
 * Single source of truth for both:
 *  - app/api/complaints/enrich-on-demand/route.ts (single-row chevron click)
 *  - lib/aura-enrich.ts                            (bulk portfolio backfill)
 *
 * To enrich a new SR type:
 *   1. Add WorkType ID + field map here.
 *   2. Flip enrichable: true in lib/sr-codes.ts.
 *   3. Add to ENRICH_CODES in property-sentinel-workers/enrich_complaints.py.
 *
 * Items in SKIP_IDS are intake question IDs we never store (PII, low-signal
 * picklists, contact windows). Same set applies across all WorkTypes.
 */

export const SKIP_IDS = new Set([
  'a1Yt0000000Lg6SEAS',
  'a1Yt0000000Lg7HEAS',
  'a1Yt0000000Lg4YEAS',
  'a1Yt0000000Lg5pEAC',
  'a1Yt0000000Lj2HEAS',
  'a1Yt0000000LiJeEAK',
  'a1Y8z0000000ZLUEA2',
  // SEC (Tree Emergency) — picklists with no column mapping
  'a1Yt0000000LiJ8EAK',
  'a1Yt0000000LiaQEAS',
  // May 2026 — contact-window and low-signal follow-ups
  'a1Yt0000000LiJaEAK',  // WM3 best time to reach
  'a1Yt0000000LiLsEAK',  // AAD best time to reach
  'a1Yt0000000LiJlEAK',  // AAI best time to reach
  'a1Yt0000000LiM0EAK',  // WM3 "if yes location"
  'a1Yt0000000LiLuEAK',  // AAD construction nearby
  'a1Yt0000000Li2MEAS',  // AAI missing lid
  'a1Yt0000000Li2JEAS',  // AAI someone pumping
  // Jun 2026 additions
  'a1Yt0000000LiJDEA0',  // SDR witness?
  'a1Yt0000000LiJEEA0',  // SDR willing to file witness report for reward?
  'a1Yt0000003GWzqEAG',  // WCA3 scheduling acknowledgment
  'a1Yt0000003GAJlEAO',  // SCSP disabled/senior 65+? (PII-adjacent)
  'a1Yt0000003PcMeEAK',  // SCSP how to send bill
])

export const QUESTION_MAP: Record<string, Record<string, string>> = {
  // BBA — Building Violation
  '08qt0000000CabpAAC': {
    description: 'a1Yt0000000LfxuEAC',
    complainant_type: 'a1Yt0000000Lg7FEAS',
    unit_number: 'a1Yt0000000Lg6cEAC',
    danger_reported: 'a1Yt0000000Lg6uEAC',
    owner_notified: 'a1Yt0000000Lg72EAC',
    owner_occupied: 'a1Yt0000000Lg73EAC',
  },
  // BBC — Plumbing Violation
  '08qt0000000CabrAAC': {
    description: 'a1Yt0000000LjBVEA0',
  },
  // BBD — No Permit / Construction
  '08qt0000000CacJAAS': {
    description: 'a1Yt0000000Lg7IEAS',
    concern_category: 'a1Yt0000000Lg7iEAC',
    unit_number: 'a1Yt0000000Lg7JEAS',
  },
  // BBK — Vacant/Abandoned Building
  '08qt0000000CacgAAC': {
    description: 'a1Yt0000000Lg4aEAC',
  },
  // BPI — Porch Inspection
  '08qt0000000CacoAAC': {
    description: 'a1Yt0000000Lg9sEAC',
    complainant_type: 'a1Yt0000000LgA6EAK',
    owner_notified: 'a1Yt0000000Lg9xEAC',
  },
  // HDF — Lead Inspection
  '08qt0000000CaYeAAK': {
    description: 'a1Yt0000000Lj2IEAS',
  },
  // SCB — Sanitation Code Violation
  '08qt0000000CacaAAC': {
    description: 'a1Yt0000000LirDEAS',
    concern_category: 'a1Yt0000000LfjBEAS',
  },
  // HFB — Restaurant
  '08qt0000000CaYiAAK': {
    restaurant_name: 'a1Yt0000000Lj1JEAS',
    description: 'a1Yt0000000Lj1IEAS',
    problem_category: 'a1Yt0000000LimCEAS',
    unit_number: 'a1Yt0000000Lj1HEAS',
  },
  // RBL — Business
  '08qt0000000CacSAAS': {
    business_name: 'a1Yt0000000cCDfEAM',
    description: 'a1Y8z0000006zcCEAQ',
    concern_category: 'a1Y8z0000006xYHEAY',
  },
  // CAFE — Sidewalk Cafe
  '08qt0000000CadBAAS': {
    business_name: 'a1Yt0000000cCDpEAM',
    concern_category: 'a1Y8z00000075hxEAA',
    description: 'a1Y8z00000075i7EAA',
  },
  // CORNVEND — Pushcart Vendor
  '08qt0000000CadIAAS': {
    business_name: 'a1Yt0000000Lj4dEAC',
    description: 'a1Yt0000000Lj4cEAC',
    unit_number: 'a1Yt0000000Lj4bEAC',
  },
  // SHVR — Shared Housing/Vacation Rental
  '08qt0000000CaexAAC': {
    complainant_type: 'a1Yt0000000LihQEAS',
    concern_category: 'a1Yt0000000LihREAS',
    description: 'a1Yt0000000LiubEAC',
  },
  // CSF — Consumer Fraud
  '08qt0000000CadNAAS': {
    concern_category: 'a1Yt0000000LiSJEA0',
    description: 'a1Yt0000000Lj2AEAS',
  },
  // CST — Consumer Retail Business
  '08qt0000000CaeeAAC': {
    business_name: 'a1Yt0000000cCDVEA2',
    concern_category: 'a1Yt0000000LiY6EAK',
    description: 'a1Yt0000000Lj8XEAS',
  },
  // BAG — Tobacco General
  '08qt0000000Cac2AAC': {
    business_name: 'a1Yt0000000LjCkEAK',
    concern_category: 'a1Yt0000000LifFEAS',
    description: 'a1Yt0000000LjCmEAK',
  },
  // BAM — Tobacco to Minors
  '08qt0000000Cab5AAC': {
    business_name: 'a1Yt0000000LjCgEAK',
    description: 'a1Yt0000000LjCjEAK',
  },
  // FPC — Fuel Pump
  '08qt0000000CaXQAA0': {
    business_name: 'a1Yt0000000cCDaEAM',
    concern_category: 'a1Yt0000000LiRsEAK',
    description: 'a1Yt0000000LjBxEAK',
  },
  // ODM — Outdated Merchandise
  '08qt0000000CaaoAAC': {
    business_name: 'a1Yt0000000cCDkEAM',
    concern_category: 'a1Yt0000000LiNKEA0',
    description: 'a1Yt0000000Lix4EAC',
  },
  // MWC — Wage Complaint
  '08qt0000000CaaLAAS': {
    business_name: 'a1Ycs000002sErFEAU',
  },
  // AAF — Water in Basement
  '08qt0000000CabOAAS': {
    concern_category: 'a1Yt0000000LiYfEAK',
    problem_category: 'a1Yt0000000Li1dEAC',
    description: 'a1Yt0000000LjFoEAK',
  },
  // NAC — No Air Conditioning
  '08q8z0000000LkrAAE': {
    description: 'a1Y8z0000000ZLKEA2',
    concern_category: 'a1Y8z0000000ZL5EAM',
    problem_category: 'a1Y8z0000000ZLPEA2',
    owner_notified: 'a1Y8z0000000ZLFEA2',
  },
  // WBJ — No Water
  '08qt0000000CaYtAAK': {
    concern_category: 'a1Yt0000000LiIyEAK',
    problem_category: 'a1Yt0000000LiCMEA0',
  },
  // WBK — Low Pressure
  '08qt0000000CaaFAAS': {
    description: 'a1Yt0000000Lit1EAC',
    concern_category: 'a1Yt0000000Lit2EAC',
    problem_category: 'a1Yt0000000LiANEA0',
  },
  // FAC — Commercial Fire Safety
  '08qt0000000CaXPAA0': {
    concern_category: 'a1Yt0000003OLaCEAW',
    problem_category: 'a1Yt0000003OLaMEAW',
  },
  // WCA — Water Quality
  '08qt0000000CaZ9AAK': {
    description: 'a1Yt0000000LfS9EAK',
  },
  // SEC — Tree Emergency
  '08qt0000000CadSAAS': {
    concern_category: 'a1Yt0000000LiaTEAS',
    problem_category: 'a1Yt0000000LfQ3EAK',
    description:      'a1Yt0000000LivfEAC',
  },
  // SGA — Rodent Baiting/Rat
  '08qt0000000CaeTAAS': {
    concern_category: 'a1Yt0000000Li1rEAC',
    problem_category: 'a1Yt0000000cAhrEAE',
  },
  // WM3 — Check for Leak
  '08qt0000000CaZYAA0': {
    concern_category: 'a1Yt0000000LiLEEA0',
    problem_category: 'a1Yt0000000LiAFEA0',
    description:      'a1Yt0000000LiooEAC',
  },
  // EAF — Vicious Animal
  '08qt0000000CafkAAC': {
    concern_category: 'a1Yt0000003XDTYEA4',
    problem_category: 'a1Yt0000000Li5WEAS',
    description:      'a1Yt0000000LiytEAC',
    owner_occupied:   'a1Yt0000000Li00EAC',
  },
  // AAD — Sewer Cave-In
  '08qt0000000CabMAAS': {
    concern_category: 'a1Yt0000000LiH6EAK',
    problem_category: 'a1Yt0000000Li2NEAS',
  },
  // AAI — Alley Sewer
  '08qt0000000CabQAAS': {
    concern_category: 'a1Yt0000000Li2KEAS',
    problem_category: 'a1Yt0000000Li2LEAS',
    description:      'a1Yt0000000LiYjEAK',
  },
  // ── Added Jun 2026 ──────────────────────────────────────────────────────
  // SDR — Fly Dumping (citywide, paraphrased)
  '08qt0000000Cad6AAC': {
    description:      'a1Yt0000000Liv8EAC',
    concern_category: 'a1Yt0000000LiPQEA0',
  },
  // WCA3 — Water Lead Test Visit (portfolio-only)
  '08qt0000000CaXEAA0': {
    danger_reported:  'a1Yt0000000Lh7cEAC',
  },
  // SCX — Recycling Inspection (portfolio-only, paraphrased)
  '08qt0000000CacyAAC': {
    description:      'a1Yt0000000Liw3EAC',
    concern_category: 'a1Yt0000000LfrmEAC',
    problem_category: 'a1Yt0000000LiLWEA0',
  },
  // SCT — Clean Vacant Lot (portfolio-only, paraphrased)
  '08qt0000000CacwAAC': {
    description:      'a1Yt0000000LivoEAC',
    concern_category: 'a1Yt0000000LivnEAC',
  },
  // SCP — Weed Removal (portfolio-only, paraphrased)
  '08qt0000000CabDAAS': {
    description:      'a1Yt0000000LioSEAS',
    concern_category: 'a1Yt0000000Li5aEAC',
    problem_category: 'a1Yt0000000LioQEAS',
  },
  // SWSNOREM — Snow / Uncleared Sidewalk (portfolio-only, paraphrased)
  '08qt0000000CafSAAS': {
    description:      'a1Yt0000000LiuKEAS',
    concern_category: 'a1Yt0000000Li4TEAS',
  },
  // SCSP — Shared Cost Sidewalk Program (portfolio-only)
  '08qt00000004DUhAAM': {
    concern_category: 'a1Yt0000003GAJqEAO',
  },
}
