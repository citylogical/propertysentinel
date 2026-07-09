import type { CSSProperties } from 'react'
import type { Entitlement } from '@/lib/entitlement'
import { resolvePlanKind, planLabel, type PlanKind } from '@/lib/plan'

type Props = {
  entitlement: Entitlement | null
  /** subscribers.role — admins present as Enterprise. */
  role?: string | null
  /** For Basic accounts: where "Upgrade" navigates (defaults to the dashboard queue flow). */
  upgradeHref?: string
  className?: string
}

const TONES: Record<PlanKind, { bg: string; border: string; text: string; dot: string }> = {
  enterprise: { bg: '#0f2744', border: '#0f2744', text: '#ffffff', dot: '#9db8d4' },
  sentinel: { bg: 'rgba(45, 106, 79, 0.10)', border: 'rgba(45, 106, 79, 0.35)', text: '#2d6a4f', dot: '#2d6a4f' },
  sentinel_trial: { bg: 'rgba(45, 106, 79, 0.10)', border: 'rgba(45, 106, 79, 0.35)', text: '#2d6a4f', dot: '#2d6a4f' },
  basic: { bg: '#f2f0eb', border: '#ddd9d0', text: '#4a5568', dot: '#8a94a0' },
}

export default function PlanBadge({ entitlement, role = null, upgradeHref = '/dashboard/portfolio', className }: Props) {
  const kind = resolvePlanKind(role, entitlement?.reason ?? null)
  const tone = TONES[kind]

  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 12px',
    borderRadius: 999,
    background: tone.bg,
    border: `1px solid ${tone.border}`,
    color: tone.text,
    fontFamily: 'DM Mono, ui-monospace, monospace',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  }

  const dotStyle: CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: tone.dot,
    flexShrink: 0,
  }

  const trialDays = kind === 'sentinel_trial' ? (entitlement?.trialDaysLeft ?? 0) : null

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      <span style={pillStyle}>
        <span style={dotStyle} aria-hidden />
        {planLabel(kind)}
      </span>
      {trialDays !== null && (
        <span style={{ fontSize: 12, color: '#4a5568' }}>
          Trial — {trialDays} day{trialDays === 1 ? '' : 's'} left
        </span>
      )}
      {kind === 'basic' && (
        <a
          href={upgradeHref}
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 600,
            color: '#0f2744',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Upgrade &rarr;
        </a>
      )}
    </span>
  )
}
