import { NextResponse } from 'next/server'

// RETIRED. This was the single-price ($10/property, quantity-based) checkout
// from the old pricing model. The activation flow replaced it with
// /api/stripe/checkout-portfolio (7 fixed bands × monthly/annual, resolved by
// Stripe lookup_key). A couple of legacy surfaces still call this endpoint
// (profile PlanBadge upgrade, alert-sync needs_checkout) — they get a clear
// error here instead of a subscription at an obsolete price. Those surfaces
// need a redesign against the band model before this file can be deleted.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Checkout has moved. Add properties from your dashboard and use Save to portfolio to start a subscription.',
    },
    { status: 410 }
  )
}
