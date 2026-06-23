import type { Entitlement } from '@/lib/entitlement'

type Props = {
  entitlement: Entitlement | null
  /** When provided, free/trial/lapsed states render a clickable UPGRADE NOW pill. */
  onUpgrade?: () => void
  className?: string
}

export default function PlanBadge({ entitlement, onUpgrade, className }: Props) {
  if (!entitlement) return null

  const wrap = (children: React.ReactNode) => (
    <span className={`plan-badge-row${className ? ` ${className}` : ''}`}>{children}</span>
  )

  if (entitlement.reason === 'enterprise') {
    return wrap(<span className="plan-badge plan-badge-enterprise">Enterprise</span>)
  }

  if (entitlement.reason === 'paying') {
    return wrap(<span className="plan-badge plan-badge-paying">Premium</span>)
  }

  // Free states: trial (with days left) and lapsed. Both get an UPGRADE NOW pill.
  const upgradePill = onUpgrade ? (
    <button type="button" className="plan-badge plan-badge-upgrade" onClick={onUpgrade}>
      Upgrade now
    </button>
  ) : (
    <span className="plan-badge plan-badge-upgrade">Upgrade now</span>
  )

  if (entitlement.reason === 'trial') {
    const d = entitlement.trialDaysLeft ?? 0
    return wrap(
      <>
        <span className="plan-badge plan-badge-trial">
          Free trial — {d} day{d === 1 ? '' : 's'} left
        </span>
        {upgradePill}
      </>
    )
  }

  // Lapsed / never-paid.
  return wrap(
    <>
      <span className="plan-badge plan-badge-lapsed">Free — expired</span>
      {upgradePill}
    </>
  )
}
