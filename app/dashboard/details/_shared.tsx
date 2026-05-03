import type { CSSProperties } from 'react'

export type StatusKind = 'open' | 'closed' | 'expired' | 'active'

export const monoLabel: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 11,
  color: '#5a7898',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

export function StatusPill({ kind }: { kind: StatusKind }) {
  const variants: Record<StatusKind, { bg: string; color: string; label: string }> = {
    open: { bg: '#fce8e8', color: '#a82020', label: 'Open' },
    closed: { bg: '#ede9e0', color: '#888', label: 'Closed' },
    expired: { bg: '#ede9e0', color: '#888', label: 'Expired' },
    active: { bg: '#d4edd0', color: '#166534', label: 'Active' },
  }
  const v = variants[kind]
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        background: v.bg,
        color: v.color,
      }}
    >
      {v.label}
    </span>
  )
}

export function ClosedPill({ closedDate }: { closedDate: string | null | undefined }) {
  const short = formatShortDate(closedDate)
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        background: '#ede9e0',
        color: '#888',
      }}
    >
      {short ? `Closed ${short}` : 'Closed'}
    </span>
  )
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}
