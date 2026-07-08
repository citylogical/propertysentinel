import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { PORTFOLIO_BANDS } from '@/lib/pricing'

// Portfolio-tier checkout for the activation flow. The client sends the
// chosen band (1-7) + interval + selected staged rows; the server resolves
// the Stripe price by lookup_key (tier3_monthly / tier3_yearly — 14 fixed
// prices under the Portfolio product), stamps the rows pending_checkout with
// the session id, and returns the hosted-checkout URL. 30-day trial on BOTH
// intervals, card captured up front, $0 due today. The webhook promotes the
// stamped rows on checkout.session.completed.

const PORTFOLIO_PRODUCT_ID = 'prod_UqjJvf8buErbzw'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    tier?: unknown
    interval?: unknown
    staged_ids?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const tier = Math.floor(Number(body.tier))
  if (!Number.isFinite(tier) || tier < 1 || tier > PORTFOLIO_BANDS.length) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }
  const interval = body.interval === 'yearly' ? 'yearly' : body.interval === 'monthly' ? 'monthly' : null
  if (!interval) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
  }
  const stagedIds = Array.isArray(body.staged_ids)
    ? body.staged_ids.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : []
  if (stagedIds.length === 0) {
    return NextResponse.json({ error: 'No properties selected' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('email, stripe_customer_id, plan')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (subscriber?.plan === 'enterprise') {
    return NextResponse.json(
      { error: 'This account is on an enterprise plan. Contact us to make changes.' },
      { status: 400 }
    )
  }

  // The selected rows must exist, belong to this user, and all have units.
  const { data: rows, error: rowsError } = await supabase
    .from('staged_properties')
    .select('id, units')
    .eq('clerk_id', userId)
    .in('id', stagedIds)
    .in('status', ['staged', 'pending_checkout'])
  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'No matching properties in your queue' }, { status: 400 })
  }
  if (rows.some((r) => r.units == null || r.units <= 0)) {
    return NextResponse.json(
      { error: 'Every selected property needs a unit count' },
      { status: 400 }
    )
  }

  // Resolve the fixed price by lookup key. Fail loudly on a mismatch — a
  // missing key means the Stripe catalog and the code have drifted.
  const lookupKey = `tier${tier}_${interval}`
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) {
    console.error('No active Stripe price for lookup key:', lookupKey)
    return NextResponse.json({ error: 'Price not configured' }, { status: 500 })
  }
  const priceProduct = typeof price.product === 'string' ? price.product : price.product.id
  if (priceProduct !== PORTFOLIO_PRODUCT_ID) {
    console.error('Price product mismatch for', lookupKey, '→', priceProduct)
    return NextResponse.json({ error: 'Price not configured' }, { status: 500 })
  }

  let customerId = subscriber?.stripe_customer_id as string | null | undefined
  if (!customerId) {
    const user = await currentUser()
    const email =
      (subscriber?.email as string | null) ??
      user?.emailAddresses?.[0]?.emailAddress ??
      undefined
    const customer = await stripe.customers.create({
      email,
      metadata: { clerk_id: userId },
    })
    customerId = customer.id
    await supabase
      .from('subscribers')
      .update({ stripe_customer_id: customerId })
      .eq('clerk_id', userId)
  }

  // Embedded checkout: the queue modal mounts Stripe's iframe in place, so
  // the user never leaves the flow. redirect_on_completion: 'never' hands
  // completion back to the client's onComplete callback instead of a
  // return_url round-trip.
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    ui_mode: 'embedded_page',
    redirect_on_completion: 'never',
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    payment_method_collection: 'always',
    allow_promotion_codes: true,
    metadata: { clerk_id: userId, portfolio_tier: String(tier), portfolio_interval: interval },
    subscription_data: {
      trial_period_days: 30,
      metadata: { clerk_id: userId },
    },
  })

  if (!session.client_secret) {
    return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 })
  }

  // Stamp the selected rows so the webhook knows exactly what to promote.
  // Abandoned sessions leave rows in pending_checkout, which still show in
  // the queue and get re-stamped on the next attempt.
  const { error: stampError } = await supabase
    .from('staged_properties')
    .update({
      status: 'pending_checkout',
      checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    })
    .eq('clerk_id', userId)
    .in('id', rows.map((r) => r.id))

  if (stampError) {
    console.error('Failed to stamp staged rows for checkout:', stampError)
    return NextResponse.json({ error: 'Could not prepare checkout' }, { status: 500 })
  }

  return NextResponse.json({ client_secret: session.client_secret })
}
