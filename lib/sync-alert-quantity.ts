import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

export type SyncResult =
  | { status: 'enterprise' }
  | { status: 'synced'; quantity: number }
  | { status: 'needs_checkout'; quantity: number }
  | { status: 'none' }

/**
 * Reconciles a user's Stripe subscription quantity to the number of
 * portfolio properties with alerts_enabled = true. Idempotent and absolute:
 * counts alerted properties and SETS quantity to that count.
 *
 * DB is the source of truth; Stripe follows. Callers must write the
 * alerts_enabled flag BEFORE calling this.
 */
export async function syncAlertQuantity(
  supabase: SupabaseClient,
  clerkUserId: string
): Promise<SyncResult> {
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('plan, stripe_subscription_id')
    .eq('clerk_id', clerkUserId)
    .maybeSingle()

  if (subscriber?.plan === 'enterprise') {
    return { status: 'enterprise' }
  }

  const { count: alertCount } = await supabase
    .from('portfolio_properties')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', clerkUserId)
    .eq('alerts_enabled', true)

  const quantity = alertCount ?? 0
  const subId = subscriber?.stripe_subscription_id as string | null | undefined

  if (!subId) {
    if (quantity > 0) return { status: 'needs_checkout', quantity }
    return { status: 'none' }
  }

  const sub = await stripe.subscriptions.retrieve(subId)
  const item = sub.items.data[0]
  if (!item) {
    return { status: 'needs_checkout', quantity }
  }

  if (quantity === 0) {
    await stripe.subscriptions.cancel(subId)
    return { status: 'synced', quantity: 0 }
  }

  if (item.quantity !== quantity) {
    await stripe.subscriptions.update(subId, {
      items: [{ id: item.id, quantity }],
      proration_behavior: 'create_prorations',
    })
  }

  return { status: 'synced', quantity }
}
