'use client'

import { ClosedPill, StatusPill, formatDate, monoLabel } from './_shared'

export type ViolationDetailRecord = {
  violation_code?: string | null
  violation_description?: string | null
  violation_inspector_comments?: string | null
  violation_ordinance?: string | null
  violation_status?: string | null
  inspection_status?: string | null
  violation_date?: string | null
  violation_last_modified_date?: string | null
  inspection_category?: string | null
  department_bureau?: string | null
  inspection_number?: string | null
  is_stop_work_order?: boolean | null
}

type Props = {
  violations: ViolationDetailRecord[]
}

export default function ViolationDetail({ violations: vols }: Props) {
  if (vols.length === 0) {
    return <div style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>No description available</div>
  }
  const first = vols[0]
  const hasOpen = vols.some((v) => {
    const s = (v.violation_status ?? v.inspection_status ?? '').toUpperCase()
    return s === 'OPEN' || s === 'FAILED'
  })
  const allComplied = vols.every((v) => {
    const s = (v.violation_status ?? '').toUpperCase()
    return s === 'COMPLIED' || s === 'PASSED' || s === 'CLOSED'
  })
  const closedDate = allComplied ? (first.violation_last_modified_date ?? null) : null
  const hasStopWork = vols.some((v) => v.is_stop_work_order === true)
  const category = first.inspection_category || 'Violation'
  const bureau = first.department_bureau || ''
  const inspNum = first.inspection_number || ''
  const ordinance = first.violation_ordinance || ''

  return (
    <>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}
      >
        <span style={monoLabel}>{formatDate(first.violation_date)}</span>
        {hasOpen ? <StatusPill kind="open" /> : <ClosedPill closedDate={closedDate} />}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>
        {category}
        {bureau ? ` · ${bureau}` : ''}
      </div>
      {hasStopWork ? (
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 8px',
            borderRadius: 3,
            background: '#fce8e8',
            color: '#a82020',
            display: 'inline-block',
            marginBottom: 8,
          }}
        >
          ⚠ Stop work order
        </div>
      ) : null}
      <div
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 11,
          color: '#888',
          marginBottom: 8,
        }}
      >
        {inspNum ? `Inspection #${inspNum}` : '—'} · {vols.length} violation{vols.length !== 1 ? 's' : ''}
      </div>
      {ordinance ? (
        <div style={{ fontSize: 11, color: '#5a7898', lineHeight: 1.4, marginBottom: 12 }}>{ordinance}</div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #d6e4f3', paddingTop: 8 }}>
        {vols.map((v, vi) => {
          const text = v.violation_inspector_comments || v.violation_description || '—'
          return (
            <div
              key={`v-${vi}`}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                fontSize: 12,
                lineHeight: 1.5,
                color: '#1a1a1a',
                padding: '6px 0',
                borderBottom: vi < vols.length - 1 ? '0.5px solid #d6e4f3' : 'none',
              }}
            >
              {v.violation_code ? (
                <span
                  style={{
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    fontSize: 9,
                    color: '#888',
                    flexShrink: 0,
                    minWidth: 48,
                  }}
                >
                  {v.violation_code}
                </span>
              ) : null}
              <span>{text}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
