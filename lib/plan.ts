import type { EntitlementReason } from '@/lib/entitlement'

// Customer-facing plan names — the only three the product uses:
//   Basic      free search, no monitoring (lapsed/never-subscribed)
//   Sentinel   the Portfolio tier (any band, including the Stripe trial)
//   Enterprise hand-managed accounts; admins present as Enterprise too
export type PlanKind = 'basic' | 'sentinel' | 'sentinel_trial' | 'enterprise'

export function resolvePlanKind(
  role: string | null | undefined,
  reason: EntitlementReason | null | undefined
): PlanKind {
  if (role === 'admin') return 'enterprise'
  if (reason === 'enterprise') return 'enterprise'
  if (reason === 'paying') return 'sentinel'
  if (reason === 'trial') return 'sentinel_trial'
  return 'basic'
}

export function planLabel(kind: PlanKind): string {
  switch (kind) {
    case 'enterprise':
      return 'Enterprise'
    case 'sentinel':
      return 'Sentinel'
    case 'sentinel_trial':
      return 'Sentinel'
    case 'basic':
      return 'Basic'
  }
}
