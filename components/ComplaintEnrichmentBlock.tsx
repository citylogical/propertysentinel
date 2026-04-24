'use client'

import type { CSSProperties } from 'react'
import { useId, useState } from 'react'

export type EnrichedComplaint = {
  sr_number: string
  sr_short_code: string | null
  sr_type: string | null
  status: string | null
  created_date: string | null
  complaint_description: string | null
  complainant_type: string | null
  unit_number: string | null
  danger_reported: string | null
  owner_notified: string | null
  owner_occupied: string | null
  concern_category: string | null
  restaurant_name: string | null
  business_name: string | null
  problem_category: string | null
  sla_target_days: number | null
  actual_mean_days: number | null
  estimated_completion: string | null
  work_order_status: string | null
  workflow_step: string | null
  enriched_at: string | null
}

const labelStyle: CSSProperties = {
  fontFamily: "var(--mono, 'DM Mono', monospace)",
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: '#7a6f62',
  marginBottom: 2,
}
const valueStyle: CSSProperties = {
  fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
  fontSize: 13,
  color: '#1a1410',
  lineHeight: 1.35,
}
const cellStyle: CSSProperties = { minWidth: 0 }

type GridRow = { key: string; label: string; value: string | null; valueDanger?: boolean } | null

function buildGridRows(d: EnrichedComplaint): GridRow[] {
  const rows: GridRow[] = []
  if (d.complainant_type) rows.push({ key: 'c', label: 'Complainant', value: d.complainant_type })
  if (d.unit_number) rows.push({ key: 'u', label: 'Unit', value: d.unit_number })
  if (d.danger_reported) {
    rows.push({
      key: 'd',
      label: 'Danger',
      value: d.danger_reported,
      valueDanger: d.danger_reported.trim().toLowerCase() === 'yes',
    })
  }
  if (d.owner_notified) rows.push({ key: 'on', label: 'Owner notified', value: d.owner_notified })
  if (d.owner_occupied) rows.push({ key: 'oo', label: 'Owner occupied', value: d.owner_occupied })
  if (d.concern_category) rows.push({ key: 'cc', label: 'Concern', value: d.concern_category })
  if (d.problem_category) rows.push({ key: 'pc', label: 'Problem', value: d.problem_category })
  return rows
}

const monoTimeStyle: CSSProperties = {
  fontFamily: "var(--mono, 'DM Mono', monospace)",
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: '#7a6f62',
  lineHeight: 1.45,
  marginTop: 10,
  paddingTop: 10,
  borderTop: '1px solid #eceae4',
}

type Props = { data: EnrichedComplaint }

export default function ComplaintEnrichmentBlock({ data: d }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const headLabel = d.restaurant_name?.trim() || d.business_name?.trim()
  const gridRows = buildGridRows(d)
  const desc = d.complaint_description?.trim()

  const slaPart =
    d.sla_target_days != null
      ? `SLA: ${d.sla_target_days} day${d.sla_target_days === 1 ? '' : 's'}`
      : null
  const avgPart = d.actual_mean_days != null ? `Avg: ${d.actual_mean_days} day${d.actual_mean_days === 1 ? '' : 's'}` : null
  const estPart = d.estimated_completion?.trim() ? `Est: ${d.estimated_completion.trim()}` : null
  const firstLine = [slaPart, avgPart, estPart].filter(Boolean).join(' · ')

  const statusPart = d.work_order_status?.trim()
  const stepPart = d.workflow_step?.trim()
  const secondLine = [statusPart && `Status: ${statusPart}`, stepPart && `Step: ${stepPart}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="complaint-enrichment-block"
      style={{ marginTop: 6, width: '100%', padding: '0 16px 0' }}
    >
      <span
        id={`${id}-trigger`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
        style={{
          color: '#c17d2a',
          fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
      >
        {open ? 'Hide details' : 'View details'}
      </span>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        style={{
          maxHeight: open ? 2000 : 0,
          overflow: 'hidden',
          transition: 'max-height 200ms ease',
        }}
      >
        <div
          style={{
            marginTop: 6,
            marginBottom: 12,
            padding: '14px 16px',
            background: '#fdfaf4',
            border: '1px solid #e5e1d6',
            borderLeft: '2px solid #c17d2a',
            borderRadius: 2,
            boxSizing: 'border-box',
          }}
        >
          {headLabel ? (
            <div
              style={{
                fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
                fontSize: 12,
                fontWeight: 700,
                color: '#1a1410',
                marginBottom: 6,
              }}
            >
              {headLabel}
            </div>
          ) : null}
          {desc ? (
            <p
              style={{
                fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
                fontSize: 14,
                fontStyle: 'italic',
                color: '#1a1410',
                margin: '0 0 12px',
                lineHeight: 1.45,
              }}
            >
              &ldquo;{desc}&rdquo;
            </p>
          ) : null}

          {gridRows.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px 16px',
                alignItems: 'start',
              }}
            >
              {gridRows.map((r) => {
                if (!r) return null
                return (
                  <div key={r.key} style={cellStyle}>
                    <div style={labelStyle}>{r.label}</div>
                    <div
                      style={{
                        ...valueStyle,
                        color: r.valueDanger ? '#b83232' : '#1a1410',
                        fontWeight: r.valueDanger ? 600 : 400,
                      }}
                    >
                      {r.value}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {(firstLine || secondLine) ? (
            <div style={monoTimeStyle}>
              {firstLine ? <div style={{ fontFamily: "var(--mono, 'DM Mono', monospace)" }}>{firstLine}</div> : null}
              {secondLine ? (
                <div
                  style={{
                    marginTop: firstLine ? 4 : 0,
                    fontFamily: "var(--mono, 'DM Mono', monospace)",
                  }}
                >
                  {secondLine}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
