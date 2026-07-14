// Public demo portfolios — slug → config.
//
// A demo portfolio is a REAL portfolio_properties set owned by a synthetic
// user_id (not a Clerk user), seeded by scripts/seed-troy-demo-portfolio.ts
// through the same staged_properties → promoteStagedRowsForUser() path the UI
// uses. Every read path (activity feed, detail drill-down, Worker C's nightly
// stats refresh) treats it exactly like a customer portfolio, so the numbers
// on /demo/[slug] tick as the city data updates — no re-snapshot needed.
//
// The synthetic user_id deliberately has NO subscribers row: the daily digest
// iterates subscribers, so the demo never emails anyone, and there is no
// Stripe subscription to reconcile against.

export type DemoSeedProperty = {
  /** The form complaints_311.address_normalized uses — activity matches on this string. */
  canonical: string
  /** Street-name variants seen in city datasets for the same building.
   *  Stored as additional_streets so getAllAddresses() expands them. */
  aliases?: string[]
}

export type DemoPortfolioConfig = {
  slug: string
  /** portfolio_properties.user_id that owns the demo rows. */
  userId: string
  /** Company name shown in the page header. */
  companyName: string
  /** Two-letter logo mark. */
  initials: string
  /** One-line source description for the Highlights tab. */
  sampleDescription: string
  /** Seed list consumed by scripts/seed-troy-demo-portfolio.ts and the
   *  admin seed route (app/api/admin/seed-demo-portfolio). */
  seedProperties: DemoSeedProperty[]
}

// Top 50 Troy Realty listings by 12-month owner-relevant complaints (then
// total complaints) — ranking query in scripts/sql/troy_realty_portfolio_demo.sql.
const TROY_REALTY_SEED: DemoSeedProperty[] = [
  { canonical: '405 N WABASH AVE' },
  { canonical: '4343 N CLARENDON AVE', aliases: ['4343 N CLARENDON ST'] },
  { canonical: '1300 N CLEAVER ST' },
  { canonical: '450 W BRIAR PL' },
  { canonical: '30 E HURON ST' },
  { canonical: '4250 N MARINE DR' },
  { canonical: '235 W VAN BUREN ST' },
  { canonical: '222 E PEARSON ST' },
  { canonical: '2728 N HAMPDEN CT' },
  { canonical: '840 E 89TH ST' },
  { canonical: '2719 W HADDON AVE' },
  { canonical: '4036 W WARWICK AVE' },
  { canonical: '7206 W WELLINGTON AVE' },
  { canonical: '1464 S MICHIGAN AVE' },
  { canonical: '10 E ONTARIO ST' },
  { canonical: '431 S DEARBORN ST' },
  { canonical: '360 W ILLINOIS ST' },
  { canonical: '10509 S EDBROOKE AVE' },
  { canonical: '5515 S OAKLEY AVE' },
  { canonical: '2442 W MADISON ST' },
  { canonical: '4941 N KILDARE AVE' },
  { canonical: '1400 S MICHIGAN AVE' },
  { canonical: '1755 E 55TH ST' },
  { canonical: '3963 W BELMONT AVE' },
  { canonical: '1841 N CALIFORNIA AVE' },
  { canonical: '3532 N OZARK AVE' },
  { canonical: '2623 W EVERGREEN AVE' },
  { canonical: '8 W MONROE ST' },
  { canonical: '234 W POLK ST' },
  { canonical: '933 W VAN BUREN ST' },
  { canonical: '3750 N LAKE SHORE DR' },
  { canonical: '1516 W DIVERSEY PKWY', aliases: ['1516 W DIVERSEY AVE'] },
  { canonical: '3440 N LAKE SHORE DR' },
  { canonical: '5422 S SAYRE AVE' },
  { canonical: '1255 S STATE ST' },
  { canonical: '111 S MORGAN ST' },
  { canonical: '401 E ONTARIO ST' },
  { canonical: '7450 S EUCLID AVE', aliases: ['7450 S EUCLID PKWY'] },
  { canonical: '757 N ORLEANS ST' },
  { canonical: '640 W BARRY AVE' },
  { canonical: '363 E WACKER DR' },
  { canonical: '740 W FULTON ST', aliases: ['740 W FULTON MARKET'] },
  { canonical: '1320 W GRENSHAW ST' },
  { canonical: '12238 S ABERDEEN ST' },
  { canonical: '1454 N CENTRAL AVE' },
  { canonical: '2322 S CANAL ST' },
  { canonical: '10122 S LUELLA AVE' },
  { canonical: '2152 W AINSLIE ST' },
  { canonical: '3906 W BELMONT AVE' },
  { canonical: '5412 S NATOMA AVE' },
]

export const DEMO_PORTFOLIOS: Record<string, DemoPortfolioConfig> = {
  'troy-realty': {
    slug: 'troy-realty',
    userId: 'demo_troy_realty',
    companyName: 'Troy Realty Ltd Demo',
    initials: 'TR',
    sampleDescription:
      'A sample of 50 residential listings from the Troy Realty portfolio, ' +
      'monitored live against Chicago 311 service requests, Department of ' +
      'Buildings violations, and building permits.',
    seedProperties: TROY_REALTY_SEED,
  },
}

export function getDemoPortfolio(slugRaw: string | null | undefined): DemoPortfolioConfig | null {
  if (!slugRaw) return null
  const slug = decodeURIComponent(slugRaw).trim().toLowerCase()
  return DEMO_PORTFOLIOS[slug] ?? null
}
