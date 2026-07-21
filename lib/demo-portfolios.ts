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
  /** The form complaints_311.address_normalized uses — activity matches on this string.
   *  Exactly one of canonical | raw per entry. */
  canonical?: string
  /** Unresolved source address (straight from a customer rent roll). The admin
   *  seed route resolves it server-side via resolveImportAddress — required for
   *  suffix-less or misspelled addresses where a hand-written canonical would
   *  silently zero activity. */
  raw?: string
  /** Street-name variants seen in city datasets for the same building.
   *  Stored as additional_streets so getAllAddresses() expands them. */
  aliases?: string[]
  /** Unit count from the customer's rent roll. Must be >= 1 on every entry of a
   *  claimable portfolio — stage/commit rejects rows without units. */
  units?: number
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
  /** SR numbers spotlighted in the Highlights "Recent signals" card.
   *  Legacy path (Troy). Prefer featuredAddresses for new demos. */
  featuredSrNumbers: string[]
  /** Addresses (normalized/canonical form) whose most-recent owner-relevant
   *  311 complaint is spotlighted in the "Recent signals" card — one card per
   *  address, resolved live at render time. Takes precedence over
   *  featuredSrNumbers when present. */
  featuredAddresses?: string[]
  /** Seed list consumed by scripts/seed-troy-demo-portfolio.ts and the
   *  admin seed route (app/api/admin/seed-demo-portfolio). */
  seedProperties: DemoSeedProperty[]
  /** Header CTA. 'claim_portfolio' routes visitors into the real
   *  stage → commit → checkout path with this portfolio pre-staged. */
  cta?: 'add_property' | 'claim_portfolio'
  /** Rent-roll totals for the claim-page intro copy (static facts about the
   *  uploaded roll — the suburb rows aren't in the DB). Present only for
   *  claim demos; when set, the intro renders the rent-roll framing. */
  rentRoll?: {
    totalProperties: number
    totalUnits: number
    chicagoProperties: number
    chicagoUnits: number
    outsideProperties: number
    outsideUnits: number
  }
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

// Chicago Style Management — full rent roll (Property Directory export,
// 2026-07-15), Chicago addresses only. 93 buildings / 217 units after
// excluding suburb properties (outside Chicago open-data coverage), summary
// and applicant rows, and merging condo units in the same building. Raw
// addresses are resolved server-side by the admin seed route.
const CHICAGO_STYLE_SEED: DemoSeedProperty[] = [
  { raw: '100 N HERMITAGE AVE', units: 1 },
  { raw: '10625 S CALUMET AVE', units: 3 },
  { raw: '10861 S AVE F', units: 1 },
  { raw: '10924 S INDIANA AVE', units: 5 },
  { raw: '10924 SOUTH HOYNE', units: 1 },
  { raw: '10934 S VERNON', units: 3 },
  { raw: '1147 E 61ST STREET', units: 1 },
  { raw: '11526 S WALLACE ST', units: 1 },
  { raw: '119 N MAYFIELD AVE', units: 3 },
  { raw: '12138 S PARNELL', units: 1 },
  { raw: '1234 110TH PL', units: 1 },
  { raw: '1235 S KOLIN', units: 3 },
  { raw: '1249 W MELROSE ST', units: 1 },
  { raw: '131 E 111TH ST', units: 2 },
  { raw: '1418 W WINONA', units: 1 },
  { raw: '1434 W 112TH PL', units: 1 },
  { raw: '1734 W 21ST PL', units: 3 },
  { raw: '1734 W CULLERTON', units: 3 },
  { raw: '1761 W MORSE AVE', units: 1 },
  { raw: '1845 SOUTH MICHIGAN AVENUE', units: 1 },
  { raw: '2024 N LARRABEE ST', units: 1 },
  { raw: '211 E OHIO ST', units: 2 },
  { raw: '2156 E 93RD ST', units: 2 },
  { raw: '2309 S SACRAMENTO', units: 3 },
  { raw: '235 W 107TH ST', units: 1 },
  { raw: '237 N LONG AVE', units: 1 },
  { raw: '2835 W 38TH PL', units: 1 },
  { raw: '2876 W 84TH ST', units: 1 },
  { raw: '3033 N SHERIDAN', units: 1 },
  { raw: '3116 S KEDVALE', units: 3 },
  { raw: '3223 N CALIFORNIA', units: 1 },
  { raw: '3302 W FULTON BLVD', units: 1 },
  { raw: '3431 S BELL', units: 1 },
  { raw: '353-357 E 55TH PLACE', units: 7 },
  { raw: '3660 N LAKE SHORE DRIVE', units: 3 },
  { raw: '4140 S ALBANY', units: 2 },
  { raw: '4429 W ADAMS ST', units: 2 },
  { raw: '4800 S CHICAGO BEACH DR', units: 1 },
  { raw: '4823 S MARSHFIELD AVE', units: 5 },
  { raw: '4900 S CHAMPLAIN AVE', units: 1 },
  { raw: '500 W ROSCOE', units: 1 },
  { raw: '5051 N LINCOLN AVENUE', units: 2 },
  { raw: '5419 SOUTH ABERDEEN STREET', units: 4 },
  { raw: '5623 S WABASH AVE', units: 3 },
  { raw: '5734 S LOOMIS BLVD', units: 2 },
  { raw: '5739 S CALUMET', units: 1 },
  { raw: '6035 S KARLOV AVENUE', units: 2 },
  { raw: '6052 S THROOP', units: 1 },
  // Corner building listed under two street frontages in the rent roll.
  { raw: '6057-6059 S SACRAMENTO AVE', aliases: ['2948-2952 W 61ST ST'], units: 11 },
  { raw: '6323 S EBERHART AVE', units: 3 },
  { raw: '6400-6402 S EBERHART', units: 3 },
  { raw: '6424 S WOODLAWN AVE', units: 1 },
  { raw: '6439 S ST LAWRENCE AVE', units: 3 },
  { raw: '653 W DIVISION', units: 1 },
  { raw: '6542 S CHAMPLAIN AVE', units: 2 },
  { raw: '655 W IRVING PARK', units: 1 },
  { raw: '6605 S KIMBARK AVE', units: 8 },
  { raw: '6646 S GREENWOOD AVE', units: 6 },
  { raw: '6829 S ABERDEEN ST', units: 1 },
  { raw: '6900 S JEFFERY BLVD', units: 4 },
  { raw: '6952 S ADA ST', units: 2 },
  { raw: '6959 SOUTH CALUMET AVENUE', units: 2 },
  { raw: '7012 S DORCHESTER AVE', units: 3 },
  { raw: '710 E 51ST ST', units: 1 },
  { raw: '7220 S CARPENTER ST', units: 3 },
  { raw: '7240 S LANGLEY', units: 2 },
  { raw: '7301 N WOLCOTT', units: 1 },
  { raw: '7346 PHILLIPS AVE', units: 3 },
  { raw: '7352 S EBERHART AVE', units: 2 },
  { raw: '7355 S EMERALD AVE', units: 2 },
  { raw: '7407 SOUTH KENWOOD AVENUE', units: 2 },
  { raw: '7421 S DANTE AVE', units: 2 },
  { raw: '7524 S ELLIS AVE', units: 2 },
  { raw: '7543 S DANTE', units: 4 },
  { raw: '758 NORTH LARRABEE ST', units: 1 },
  { raw: '7614 S MARYLAND', units: 2 },
  { raw: '7649 S GREEN', units: 2 },
  { raw: '7704 S ABERDEEN', units: 4 },
  { raw: '7822 S KINGSTON', units: 3 },
  { raw: '7831 S AVALON AVENUE', units: 1 },
  { raw: '7831-7833 S COLFAX AVE', units: 8 },
  { raw: '8053 S WOODLAWN', units: 1 },
  { raw: '8251 S COMMERCIAL AVE', units: 4 },
  { raw: '8707 S MANISTEE AVE', units: 4 },
  { raw: '8756 S EXCHANGE AVE', units: 4 },
  { raw: '9017 S BISHOP ST', units: 1 },
  { raw: '9025 S CARPENTER ST', units: 2 },
  { raw: '9035 S BURLEY AVE', units: 4 },
  { raw: '9040 S DAUPHIN AVE', units: 1 },
  { raw: '9328 S YATES BLVD', units: 3 },
  { raw: '9517 SOUTH ESCANABA AVE', units: 2 },
  { raw: '9713 S OGLESBY AVE', units: 1 },
  { raw: '9716 S LUELLA AVE', units: 1 },
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
      "Buildings violations, and building permits. Send us a full address list " +
      "for the city of Chicago and we'll start sending you alerts in less than 24hrs.",
    featuredSrNumbers: ['SR26-01341696', 'SR26-01337770', 'SR26-01291319'],
    seedProperties: TROY_REALTY_SEED,
  },
  'chicago-style': {
    slug: 'chicago-style',
    userId: 'demo_chicago_style',
    companyName: 'Chicago Style Management Demo',
    initials: 'CS',
    sampleDescription:
      'The full Chicago Style Management rent roll — 93 Chicago buildings and ' +
      '217 units — monitored live against Chicago 311 service requests, ' +
      'Department of Buildings violations, and building permits. Claim this ' +
      'portfolio to start receiving alerts on these exact buildings.',
    featuredSrNumbers: [],
    featuredAddresses: ['7421 S DANTE AVE', '6646 S GREENWOOD AVE', '1235 S KOLIN AVE'],
    seedProperties: CHICAGO_STYLE_SEED,
    cta: 'claim_portfolio',
    rentRoll: {
      totalProperties: 132,
      totalUnits: 283,
      chicagoProperties: 93,
      chicagoUnits: 217,
      outsideProperties: 39,
      outsideUnits: 66,
    },
  },
}

export function getDemoPortfolio(slugRaw: string | null | undefined): DemoPortfolioConfig | null {
  if (!slugRaw) return null
  const slug = decodeURIComponent(slugRaw).trim().toLowerCase()
  return DEMO_PORTFOLIOS[slug] ?? null
}
