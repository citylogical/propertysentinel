'use client'

import type { CSSProperties } from 'react'
import { useCallback, useEffect, useId, useState } from 'react'
import type { ComplaintRow } from '@/lib/supabase-search'

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

/** Aligns with WorkType → QUESTION_MAP in the on-demand enrichment API. */
const ENRICHABLE_SR_SHORT_CODES = new Set([
  'BBA',
  'BBC',
  'BBD',
  'BBK',
  'BPI',
  'HDF',
  'SCB',
  'HFB',
  'RBL',
  'CAFE',
  'CORNVEND',
  'SHVR',
  'CSF',
  'CST',
  'BAG',
  'BAM',
  'FPC',
  'ODM',
  'MWC',
  'AAF',
  'NAC',
  'WBJ',
  'WBK',
  'FAC',
  'WCA',
])

function isEnrichableComplaint(srShort: string | null): boolean {
  if (!srShort) return false
  return ENRICHABLE_SR_SHORT_CODES.has(srShort.trim().toUpperCase())
}

export function mergeComplaintWithEnrichPayload(
  c: ComplaintRow,
  data: Record<string, unknown>,
): EnrichedComplaint {
  const g = (k: string): string | null => {
    const v = data[k]
    if (v == null) return null
    const s = String(v).trim()
    return s || null
  }
  const gn = (k: string): number | null => {
    const v = data[k]
    if (v == null) return null
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.round(v)
    const n = Number(v)
    return Number.isNaN(n) ? null : Math.round(n)
  }
  return {
    sr_number: String(c.sr_number),
    sr_short_code: c.sr_short_code,
    sr_type: c.sr_type,
    status: c.status,
    created_date: c.created_date,
    complaint_description: g('complaint_description'),
    complainant_type: g('complainant_type'),
    unit_number: g('unit_number'),
    danger_reported: g('danger_reported'),
    owner_notified: g('owner_notified'),
    owner_occupied: g('owner_occupied'),
    concern_category: g('concern_category'),
    restaurant_name: g('restaurant_name'),
    business_name: g('business_name'),
    problem_category: g('problem_category'),
    sla_target_days: gn('sla_target_days'),
    actual_mean_days: gn('actual_mean_days'),
    estimated_completion: g('estimated_completion'),
    work_order_status: g('work_order_status'),
    workflow_step: g('workflow_step'),
    enriched_at: g('enriched_at'),
  }
}

type Props = {
  complaint: ComplaintRow
  /** Present when the session map has enrichment for this SR; omit if not yet loaded. */
  enrich: EnrichedComplaint | undefined
  onEnriched: (row: EnrichedComplaint) => void
  /** `sr_number` of the row currently running on-demand fetch, or `null` if none. */
  enrichActiveSr: string | null
  onEnrichSessionChange: (sr: string | null) => void
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const datePart = d.toISOString().split('T')[0]
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${datePart} ${pad(h)}:${pad(m)}`
}

function isStatusOpen(status: string | null): boolean {
  return (status ?? '').toUpperCase() === 'OPEN'
}

function buildGridRows(d: EnrichedComplaint) {
  const rows: { key: string; label: string; value: string; danger?: boolean }[] = []
  if (d.complainant_type) rows.push({ key: 'c', label: 'Complainant', value: d.complainant_type })
  if (d.unit_number) rows.push({ key: 'u', label: 'Unit', value: d.unit_number })
  if (d.danger_reported) {
    const v = d.danger_reported.trim()
    rows.push({ key: 'd', label: 'Danger', value: v, danger: v.toLowerCase() === 'yes' })
  }
  if (d.owner_notified) rows.push({ key: 'on', label: 'Owner notified', value: d.owner_notified })
  if (d.owner_occupied) rows.push({ key: 'oo', label: 'Owner occupied', value: d.owner_occupied })
  if (d.concern_category) rows.push({ key: 'cc', label: 'Concern', value: d.concern_category })
  if (d.problem_category) rows.push({ key: 'pc', label: 'Problem', value: d.problem_category })
  return rows
}

function buildSlaLine(d: EnrichedComplaint): string {
  const parts: string[] = []
  if (d.sla_target_days != null) parts.push(`SLA: ${d.sla_target_days} DAYS`)
  if (d.actual_mean_days != null) parts.push(`AVG: ${d.actual_mean_days} DAYS`)
  if (d.estimated_completion?.trim()) parts.push(`EST: ${d.estimated_completion.trim().toUpperCase()}`)
  return parts.join(' · ')
}

const label: CSSProperties = {
  fontFamily: "var(--mono, 'DM Mono', monospace)",
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#7a6f62',
  marginBottom: 2,
}
const val: CSSProperties = {
  fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
  fontSize: 12,
  color: '#1a1410',
  lineHeight: 1.4,
}

function EnrichmentPanelContent({ d }: { d: EnrichedComplaint }) {
  const head = d.restaurant_name?.trim() || d.business_name?.trim()
  const desc = d.complaint_description?.trim()
  const grid = buildGridRows(d)
  return (
    <>
      {head ? (
        <div
          style={{
            fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
            fontSize: 13,
            fontWeight: 500,
            color: '#1a1410',
            marginBottom: 6,
          }}
        >
          {head}
        </div>
      ) : null}
      {desc ? (
        <p
          style={{
            fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
            fontSize: 13,
            fontStyle: 'italic',
            color: '#1a1410',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          &ldquo;{desc}&rdquo;
        </p>
      ) : null}
      {grid.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 14,
            alignItems: 'start',
          }}
        >
          {grid.map((r) => (
            <div key={r.key} style={{ minWidth: 0 }}>
              <div style={label}>{r.label}</div>
              <div style={{ ...val, color: r.danger ? '#b83232' : '#1a1410', fontWeight: r.danger ? 600 : 400 }}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}

function MobileStackFallback({
  d,
  open,
  onToggle,
}: {
  d: EnrichedComplaint
  open: boolean
  onToggle: () => void
}) {
  const id = useId()
  return (
    <div className="complaint-enrich-mobile" style={{ width: '100%' }}>
      <span
        id={`${id}-trig`}
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        style={{
          color: '#c17d2a',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
          display: 'inline-block',
          marginTop: 8,
        }}
        aria-expanded={open}
        aria-controls={`${id}-mob`}
      >
        {open ? 'Hide details' : 'View details'}
      </span>
      <div
        id={`${id}-mob`}
        style={{
          maxHeight: open ? 2400 : 0,
          overflow: 'hidden',
          transition: 'max-height 200ms ease',
        }}
      >
        <div
          style={{
            marginTop: 8,
            marginBottom: 4,
            padding: '14px 16px',
            background: '#ffffff',
            border: '1px solid #e5e1d6',
            borderLeft: '2px solid #c17d2a',
            boxSizing: 'border-box',
          }}
        >
          <EnrichmentPanelContent d={d} />
        </div>
      </div>
    </div>
  )
}

const rightPanelTransition = 'flex-basis 200ms ease, opacity 200ms ease, padding 200ms ease'

const spinKeyframes = `
  @keyframes complaintEnrichSpin {
    to { transform: rotate(360deg); }
  }
`

function ChevronToggleButton({
  expanded,
  onClick,
  ariaLabel,
  borderStyle,
  disabled,
  isLoading,
  errorFlash,
}: {
  expanded: boolean
  onClick: () => void
  ariaLabel: string
  borderStyle: 'dashed' | 'solid'
  disabled: boolean
  isLoading: boolean
  errorFlash: boolean
}) {
  const baseBorder = errorFlash ? '1px solid #c0392b' : `1px ${borderStyle} #d4c9b0`
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-expanded={expanded}
      aria-label={ariaLabel}
      style={{
        width: 30,
        height: 30,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        border: baseBorder,
        color: errorFlash ? '#c0392b' : '#7a6f62',
        fontFamily: "var(--mono, 'DM Mono', monospace)",
        fontSize: 12,
        lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: '50%',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        opacity: disabled && !isLoading ? 0.5 : 1,
        transform: expanded ? 'rotate(180deg)' : 'none',
        transition: 'all 0.15s, transform 200ms ease',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        if (disabled || isLoading) return
        e.currentTarget.style.background = '#f5f0e8'
        e.currentTarget.style.color = '#1a1410'
        e.currentTarget.style.border = `1px ${borderStyle} #c17d2a`
        if (errorFlash) e.currentTarget.style.border = '1px solid #c0392b'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#ffffff'
        e.currentTarget.style.color = errorFlash ? '#c0392b' : '#7a6f62'
        e.currentTarget.style.border = baseBorder
      }}
    >
      {isLoading ? (
        <span
          aria-hidden
          style={{
            display: 'block',
            width: 16,
            height: 16,
            border: '2px solid rgba(199, 125, 42, 0.3)',
            borderTopColor: '#b7791f',
            borderRadius: '50%',
            animation: 'complaintEnrichSpin 0.7s linear infinite',
          }}
        />
      ) : (
        <span aria-hidden>
          {'\u203a'}
          {'\u203a'}
        </span>
      )}
    </button>
  )
}

function ChevronWithSpinStyle() {
  return <style dangerouslySetInnerHTML={{ __html: spinKeyframes }} />
}

export default function ComplaintRowEnriched({
  complaint: c,
  enrich: enrichFromParent,
  onEnriched,
  enrichActiveSr,
  onEnrichSessionChange,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [errorFlash, setErrorFlash] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const srKey = String(c.sr_number)
  const isEnrichable = isEnrichableComplaint(c.sr_short_code)
  const hasEnrich = Boolean(enrichFromParent)
  const thisRowLoading = enrichActiveSr === srKey
  const anotherRowBusy = enrichActiveSr != null && enrichActiveSr !== srKey
  const chevronLocked = anotherRowBusy

  const borderStyle: 'dashed' | 'solid' = hasEnrich ? 'solid' : 'dashed'
  const showDesktopChevron = isEnrichable && !narrow

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const run = () => setNarrow(mq.matches)
    run()
    mq.addEventListener('change', run)
    return () => mq.removeEventListener('change', run)
  }, [])

  const runOnDemand = useCallback(async () => {
    onEnrichSessionChange(srKey)
    try {
      const res = await fetch('/api/complaints/enrich-on-demand', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sr_number: srKey }),
      })
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown>; error?: string }
      if (!res.ok || !j.success || !j.data) {
        setErrorFlash(true)
        window.setTimeout(() => setErrorFlash(false), 1200)
        return
      }
      const row = mergeComplaintWithEnrichPayload(c, j.data)
      onEnriched(row)
      setExpanded(true)
      setMobileOpen(true)
    } catch {
      setErrorFlash(true)
      window.setTimeout(() => setErrorFlash(false), 1200)
    } finally {
      onEnrichSessionChange(null)
    }
  }, [c, onEnriched, onEnrichSessionChange, srKey])

  const onMainChevron = useCallback(() => {
    if (!isEnrichable) return
    if (chevronLocked) return
    if (hasEnrich) {
      setExpanded((e) => !e)
      return
    }
    if (thisRowLoading) return
    void runOnDemand()
  }, [isEnrichable, chevronLocked, hasEnrich, thisRowLoading, runOnDemand])

  const onMobileLoadDetails = useCallback(() => {
    if (!isEnrichable) return
    if (chevronLocked || thisRowLoading) return
    void runOnDemand()
  }, [isEnrichable, chevronLocked, thisRowLoading, runOnDemand])

  const open = isStatusOpen(c.status)
  const metaBits = [c.owner_department, c.origin].filter(Boolean)
  const metaLine = `${metaBits.join(' · ')}${metaBits.length ? ' · ' : ''}Filed: ${formatDateTime(c.created_date)}`
  const d: EnrichedComplaint | null = enrichFromParent ?? null
  const sla = d ? buildSlaLine(d) : ''
  const stepLine =
    d?.workflow_step?.trim() && hasEnrich ? `STEP: ${d.workflow_step.trim().toUpperCase()}` : ''

  const badgeBase: CSSProperties = {
    fontFamily: "var(--mono, 'DM Mono', monospace)",
    fontSize: 10,
    textTransform: 'uppercase',
    padding: '3px 10px',
    borderRadius: 2,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    border: '1px solid',
  }
  const badgeOpen: CSSProperties = {
    ...badgeBase,
    background: '#fef3cd',
    color: '#856404',
    borderColor: '#f0e0a0',
  }
  const badgeDone: CSSProperties = {
    ...badgeBase,
    background: '#d4edda',
    color: '#155724',
    borderColor: '#c3e6cb',
  }

  const rightPanelOpen = isEnrichable && hasEnrich && expanded

  const leftContent = (includeChevron: boolean) => (
    <div
      style={{
        flex: '1 1 0%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
              fontSize: 15,
              fontWeight: 500,
              color: '#1a1410',
            }}
          >
            {c.sr_type ?? '—'}
          </div>
          <div
            style={{
              fontFamily: '"DM Sans", var(--sans, system-ui, sans-serif)',
              fontSize: 12,
              color: '#7a6f62',
              marginTop: 3,
              lineHeight: 1.4,
            }}
          >
            {metaLine}
          </div>
          {c.closed_date ? (
            <div style={{ fontSize: 12, color: '#7a6f62', marginTop: 2 }}>
              Closed: <span style={{ fontWeight: 500, color: '#1a1410' }}>{formatDateTime(c.closed_date)}</span>
            </div>
          ) : null}
          <div
            style={{
              fontFamily: "var(--mono, 'DM Mono', monospace)",
              fontSize: 11,
              color: '#9a8f82',
              marginTop: 4,
            }}
          >
            #{c.sr_number}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: includeChevron ? 8 : 0,
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          <span style={open ? badgeOpen : badgeDone}>{open ? 'Open' : 'Completed'}</span>
          {includeChevron ? (
            <ChevronToggleButton
              expanded={expanded}
              onClick={onMainChevron}
              borderStyle={borderStyle}
              disabled={chevronLocked || thisRowLoading}
              isLoading={thisRowLoading}
              errorFlash={errorFlash}
              ariaLabel={
                hasEnrich
                  ? expanded
                    ? 'Collapse complaint details'
                    : 'Expand complaint details'
                  : 'Load complaint details from CHI 311'
              }
            />
          ) : null}
        </div>
      </div>
      {hasEnrich && (sla || stepLine) ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--mono, 'DM Mono', monospace)",
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#7a6f62',
            lineHeight: 1.45,
          }}
        >
          {sla ? <div>{sla}</div> : null}
          {stepLine ? <div style={{ marginTop: sla ? 3 : 0 }}>{stepLine}</div> : null}
        </div>
      ) : null}
    </div>
  )

  if (narrow) {
    return (
      <div
        className="complaint-row-enriched"
        style={{
          border: '1px solid #e5e1d6',
          background: '#ffffff',
          marginBottom: 8,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ChevronWithSpinStyle />
        {leftContent(false)}
        <div style={{ padding: '0 16px 12px' }}>
          {isEnrichable && !hasEnrich ? (
            <div>
              <span
                role="button"
                tabIndex={0}
                onClick={onMobileLoadDetails}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onMobileLoadDetails()
                  }
                }}
                style={{
                  color: thisRowLoading ? '#7a6f62' : '#c17d2a',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: chevronLocked || thisRowLoading ? 'not-allowed' : 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                  display: 'inline-block',
                  marginTop: 8,
                  opacity: chevronLocked ? 0.5 : 1,
                }}
                aria-disabled={chevronLocked}
              >
                {thisRowLoading ? 'Loading…' : 'Load details'}
              </span>
            </div>
          ) : isEnrichable && d ? (
            <MobileStackFallback d={d} open={mobileOpen} onToggle={() => setMobileOpen((o) => !o)} />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className="complaint-row-enriched"
      style={{
        border: '1px solid #e5e1d6',
        background: '#ffffff',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'flex-start',
        boxSizing: 'border-box',
      }}
    >
      <ChevronWithSpinStyle />
      {leftContent(showDesktopChevron)}

      {isEnrichable ? (
        <div
          style={{
            flexGrow: 0,
            flexShrink: 0,
            flexBasis: rightPanelOpen ? '50%' : '0%',
            minWidth: 0,
            overflow: rightPanelOpen ? 'auto' : 'hidden',
            opacity: rightPanelOpen ? 1 : 0,
            padding: rightPanelOpen ? '14px 16px' : '14px 0',
            transition: rightPanelTransition,
            background: '#ffffff',
            borderLeft: rightPanelOpen ? '1px solid #e5e1d6' : 'none',
            boxSizing: 'border-box',
            pointerEvents: rightPanelOpen ? 'auto' : 'none',
          }}
        >
          {d && hasEnrich && expanded ? <EnrichmentPanelContent d={d} /> : null}
        </div>
      ) : null}
    </div>
  )
}
