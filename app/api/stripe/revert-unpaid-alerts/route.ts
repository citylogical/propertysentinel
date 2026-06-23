import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

/**
 * Called when a user returns from an abandoned/cancelled checkout. Reverts
 * alerts_enabled flags that aren't backed by a paid Stripe seat, so a
 * cancelled checkout doesn't leave phantom-enabled alerts in the DB.
 *
 * - enterprise: no-op (all alerts are legitimately on, unbilled by design)
 * - no subscription: revert ALL flagged properties to false
 * - active subscription: revert flagged properties down to the paid quantity
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('plan, stripe_subscription_id')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (subscriber?.plan === 'enterprise') {
    return NextResponse.json({ status: 'enterprise', reverted: 0 })
  }

  // Determine how many alert seats are actually paid for.
  let paidQuantity = 0
  const subId = subscriber?.stripe_subscription_id as string | null | undefined
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId)
      const active = sub.status === 'active' || sub.status === 'trialing'
      paidQuantity = active ? (sub.items.data[0]?.quantity ?? 0) : 0
    } catch {
      paidQuantity = 0
    }
  }

  // Flagged properties, oldest first — we keep the oldest `paidQuantity` and
  // revert the rest (the ones the user just tried to add but didn't pay for).
  const { data: flagged } = await supabase
    .from('portfolio_properties')
    .select('id')
    .eq('user_id', userId)
    .eq('alerts_enabled', true)
    .order('created_at', { ascending: true })

  const rows = flagged ?? []
  const toRevert = rows.slice(paidQuantity)

  if (toRevert.length === 0) {
    return NextResponse.json({ status: 'ok', reverted: 0 })
  }

  const ids = toRevert.map((r) => r.id as string)
  await supabase
    .from('portfolio_properties')
    .update({ alerts_enabled: false, alert_email: false, alert_sms: false })
    .in('id', ids)

  return NextResponse.json({ status: 'ok', reverted: ids.length })
}
