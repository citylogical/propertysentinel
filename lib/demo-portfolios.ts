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
}

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
  },
}

export function getDemoPortfolio(slugRaw: string | null | undefined): DemoPortfolioConfig | null {
  if (!slugRaw) return null
  const slug = decodeURIComponent(slugRaw).trim().toLowerCase()
  return DEMO_PORTFOLIOS[slug] ?? null
}
