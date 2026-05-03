'use client'

import { StatusPill, formatDate, formatShortDate, monoLabel } from './_shared'

export type PermitDetailRecord = {
  permit_number?: string | null
  permit_type?: string | null
  permit_status?: string | null
  work_description?: string | null
  issue_date?: string | null
  reported_cost?: number | string | null
  total_fee?: number | string | null
  contact_1_name?: string | null
  contact_1_type?: string | null
}

type Props = {
  permit: PermitDetailRecord
}

export default function PermitDetail({ permit: pr }: Props) {
  const workDesc = (pr.work_description ?? '').trim()

  const computeExpiry = (iso: string | null | undefined) => {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    const exp = new Date(d.getTime() + 540 * 24 * 60 * 60 * 1000)
    return { label: formatShortDate(exp.toISOString()), isExpired: new Date() > exp }
  }
  const expiry = computeExpiry(pr.issue_date)

  return (
    <>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}
      >
        <span style={monoLabel}>{formatDate(pr.issue_date)}</span>
        <StatusPill kind={expiry?.isExpired ? 'expired' : 'active'} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>
        {pr.permit_type ?? '—'}
      </div>
      {pr.permit_number ? (
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11,
            color: '#888',
            marginBottom: 10,
          }}
        >
          #{pr.permit_number}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 13,
          color: workDesc ? '#1a1a1a' : '#888',
          lineHeight: 1.4,
          marginBottom: 12,
          fontStyle: workDesc ? 'normal' : 'italic',
        }}
      >
        {workDesc || 'No description available'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {expiry ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#5a7898' }}>{expiry.isExpired ? 'Expired' : 'Expires'}</span>
            <span style={{ color: expiry.isExpired ? '#a82020' : '#1a1a1a', fontWeight: 500 }}>
              {expiry.label}
            </span>
          </div>
        ) : null}
        {pr.reported_cost != null && Number(pr.reported_cost) > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#5a7898' }}>Cost</span>
            <span style={{ color: '#1a1a1a', fontWeight: 500 }}>
              ${Number(pr.reported_cost).toLocaleString()}
            </span>
          </div>
        ) : null}
        {pr.total_fee != null && Number(pr.total_fee) > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#5a7898' }}>Fee</span>
            <span style={{ color: '#1a1a1a', fontWeight: 500 }}>
              ${Number(pr.total_fee).toLocaleString()}
            </span>
          </div>
        ) : null}
        {pr.contact_1_name ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8, marginTop: 4 }}>
            <span
              style={{
                color: '#5a7898',
                flexShrink: 0,
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 10,
                letterSpacing: '0.04em',
              }}
            >
              {pr.contact_1_type ?? 'Contact'}
            </span>
            <span style={{ color: '#1a1a1a', fontWeight: 500, textAlign: 'right' }}>
              {pr.contact_1_name}
            </span>
          </div>
        ) : null}
      </div>
    </>
  )
}
