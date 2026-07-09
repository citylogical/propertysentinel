// Portfolio-tier pricing bands — the single source of truth for the
// 7 snapped flat-fee bands (EVpin-style: flat per band, not per-unit metered).
// The pricing showcase on /about and the dashboard staging queue both
// recommend from this table; Stripe holds 14 fixed prices (7 bands ×
// monthly/annual) that map 1:1 onto these rows.
//
// Units are SELF-REPORTED at add time and the recommended band is a starting
// estimate the user can override at checkout.

export type PortfolioBand = {
  /** Inclusive unit cap for this band. */
  cap: number
  /** Monthly list price in whole dollars. */
  monthly: number
  /** Effective per-month price on the annual plan (list × 0.8). */
  annualMonthly: number
}

export const PORTFOLIO_BANDS: PortfolioBand[] = [
  { cap: 10, monthly: 25, annualMonthly: 20 },
  { cap: 20, monthly: 50, annualMonthly: 40 },
  { cap: 40, monthly: 100, annualMonthly: 80 },
  { cap: 100, monthly: 250, annualMonthly: 200 },
  { cap: 225, monthly: 500, annualMonthly: 400 },
  { cap: 375, monthly: 750, annualMonthly: 600 },
  { cap: 550, monthly: 1000, annualMonthly: 800 },
]

/** Above this unit count there is no self-serve band — route to contact (Max). */
export const MAX_TIER_UNITS = 550

export const ANNUAL_MULT = 0.8

/** Index into PORTFOLIO_BANDS for a unit count, or null for Max territory. */
export function bandIndexForUnits(units: number): number | null {
  if (!Number.isFinite(units) || units <= 0) return 0
  if (units > MAX_TIER_UNITS) return null
  for (let i = 0; i < PORTFOLIO_BANDS.length; i++) {
    if (units <= PORTFOLIO_BANDS[i].cap) return i
  }
  return null
}

export function bandForUnits(units: number): PortfolioBand | null {
  const i = bandIndexForUnits(units)
  return i === null ? null : PORTFOLIO_BANDS[i]
}

/** "Up to 100 units" label for a band. */
export function bandLabel(band: PortfolioBand): string {
  return `Up to ${band.cap} units`
}

/** Unit cap for a Stripe price lookup_key (tier3_monthly → 40), or null. */
export function capForLookupKey(key: string | null | undefined): number | null {
  const m = /^tier(\d+)_(?:monthly|yearly)$/.exec(key ?? '')
  if (!m) return null
  const band = PORTFOLIO_BANDS[Number(m[1]) - 1]
  return band ? band.cap : null
}
