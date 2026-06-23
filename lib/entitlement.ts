import type { SupabaseClient } from '@supabase/supabase-js'

export const TRIAL_DAYS = 30

export type EntitlementReason = 'enterprise' | 'paying' | 'trial' | 'none'

export type Entitlement = {
  entitled: boolean
  reason: EntitlementReason
  /** ISO date the trial ends, when reason is 'trial'. Null otherwise. */
  trialEndsAt: string | null
  /** Whole days left in trial (>= 0), when reason is 'trial'. Null otherwise. */
  trialDaysLeft: number | null
}

const NOT_ENTITLED: Entitlement = {
  entitled: false,
  reason: 'none',
  trialEndsAt: null,
  trialDaysLeft: null,
}

type SubscriberEntitlementFields = {
  plan: string | null
  subscription_status: string | null
  trial_started_at: string | null
}

/**
 * Pure entitlement computation from subscriber fields. No I/O — safe to call
 * from anywhere you already have the row. The single source of truth for
 * "can this account see reports and receive alerts."
 *
 * Order matters: enterprise and active subscriptions win regardless of trial
 * state, so a paying or enterprise account is never shown trial messaging.
 */
export function computeEntitlement(sub: SubscriberEntitlementFields | null): Entitlement {
  if (!sub) return NOT_ENTITLED

  if (sub.plan === 'enterprise') {
    return { entitled: true, reason: 'enterprise', trialEndsAt: null, trialDaysLeft: null }
  }

  // Stripe-backed paid states. 'trialing' here means a real Stripe trial on an
  // actual subscription (card on file, will auto-charge) — distinct from our
  // pre-subscription trial_started_at window below.
  if (sub.subscription_status === 'active' || sub.subscription_status === 'trialing') {
    return { entitled: true, reason: 'paying', trialEndsAt: null, trialDaysLeft: null }
  }

  // Pre-subscription free trial: 30 days from first saved property.
  if (sub.trial_started_at) {
    const started = new Date(sub.trial_started_at).getTime()
    if (Number.isFinite(started)) {
      const endsMs = started + TRIAL_DAYS * 24 * 60 * 60 * 1000
      const now = Date.now()
      if (now < endsMs) {
        const msLeft = endsMs - now
        const trialDaysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000))
        return {
          entitled: true,
          reason: 'trial',
          trialEndsAt: new Date(endsMs).toISOString(),
          trialDaysLeft,
        }
      }
    }
  }

  return NOT_ENTITLED
}

/**
 * Fetch the subscriber row and compute entitlement. Use this in server routes
 * and server components where you have a clerk userId but not the row yet.
 * Returns NOT_ENTITLED for an unknown user rather than throwing.
 */
export async function getEntitlement(
  supabase: SupabaseClient,
  clerkUserId: string
): Promise<Entitlement> {
  const { data, error } = await supabase
    .from('subscribers')
    .select('plan, subscription_status, trial_started_at')
    .eq('clerk_id', clerkUserId)
    .maybeSingle()

  if (error || !data) return NOT_ENTITLED
  return computeEntitlement(data as SubscriberEntitlementFields)
}
