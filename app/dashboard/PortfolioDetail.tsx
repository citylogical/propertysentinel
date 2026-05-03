'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import NearbyListingsModal from '@/components/NearbyListingsModal'
import UpgradeModal from '@/components/UpgradeModal'
import type { PortfolioProperty } from './types'

type Props = {
  property: PortfolioProperty
  onClose: () => void
  /** When set, fetches activity from this URL instead of the authenticated dashboard detail API. */
  detailEndpoint?: string
  /** When false, hides the foot link under recent activity (e.g. public audit). Defaults to true. */
  showHistoricalActivityBar?: boolean
  /** When true, renders the third "RECENT 311 REPORTS" column with up to 3 paraphrased descriptions. Audit only. */
  showParaphrasedReports?: boolean
  /** When provided, the "Listings nearby" button calls this instead of opening the listings map. Audit-only gate. */
  onUpgradePrompt?: () => void
}

type DetailPayload = {
  recent_complaints?: Record<string, unknown>[]
  recent_violations?: Record<string, unknown>[]
  recent_permits?: Record<string, unknown>[]
  latest_violation_date?: string | null
  latest_permit_date?: string | null
  str_registrations?: number
  is_restricted_zone?: boolean
  nearby_listings?: number
}

type ComplaintSource = Record<string, unknown>
type ViolationSource = Record<string, unknown>
type PermitSource = Record<string, unknown>

type ActivityItem = {
  id: string
  type: '311' | 'Violation' | 'Permit'
  label: string
  date: string
  status: string
  detail?: string
  complaint?: ComplaintSource
  violations?: ViolationSource[]
  permit?: PermitSource
}

type StatusKind = 'open' | 'closed' | 'expired' | 'active'

function StatusPill({ kind }: { kind: StatusKind }) {
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

export default function PortfolioDetail({
  property: p,
  onClose: _onClose,
  detailEndpoint,
  showHistoricalActivityBar = true,
  showParaphrasedReports = false,
  onUpgradePrompt,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [detailData, setDetailData] = useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [showListings, setShowListings] = useState(false)
  const [propertyCoords, setPropertyCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedActivityKey, setSelectedActivityKey] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [p.id])

  useEffect(() => {
    setSelectedActivityKey(null)
  }, [p.id])

  useEffect(() => {
    setDetailLoading(true)
    setDetailData(null)
    const url = detailEndpoint ?? `/api/dashboard/detail?id=${encodeURIComponent(p.id)}`
    fetch(url)
      .then((res) => res.json())
      .then((data: DetailPayload & { error?: string }) => {
        if (data.error) setDetailData(null)
        else setDetailData(data)
      })
      .catch(() => setDetailData(null))
      .finally(() => setDetailLoading(false))
  }, [p.id, detailEndpoint])

  useEffect(() => {
    const pin = p.pins?.[0]
    if (!pin) {
      setPropertyCoords(null)
      return
    }
    let cancelled = false
    fetch(`/api/parcel-coords?pin=${encodeURIComponent(pin)}`)
      .then((res) => res.json())
      .then((data: { lat?: number | null; lng?: number | null }) => {
        if (cancelled) return
        if (data.lat != null && data.lng != null && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
          setPropertyCoords({ lat: data.lat, lng: data.lng })
        } else {
          setPropertyCoords(null)
        }
      })
      .catch(() => {
        if (!cancelled) setPropertyCoords(null)
      })
    return () => {
      cancelled = true
    }
  }, [p.id, p.pins?.[0] ?? ''])

  const money = (val: number | null) =>
    val != null && Number.isFinite(val) ? `$${val.toLocaleString()}` : 'N/A'

  const chars = (p.building_chars ?? {}) as Record<string, unknown>

  const activity: ActivityItem[] = detailLoading
    ? []
    : [
        ...(detailData?.recent_complaints ?? []).map((c, idx) => {
          const row = c as {
            sr_type?: string | null
            created_date?: string | null
            sr_number?: string | null
            status?: string | null
          }
          return {
            id: row.sr_number ? String(row.sr_number) : `complaint-${idx}`,
            type: '311' as const,
            label: row.sr_type ?? 'Complaint',
            date: row.created_date ?? '',
            status: row.status ?? '',
            complaint: c as ComplaintSource,
          }
        }),
        ...(() => {
          const violRows = (detailData?.recent_violations ?? []) as {
            inspection_category?: string | null
            department_bureau?: string | null
            violation_date?: string | null
            violation_status?: string | null
            inspection_status?: string | null
            violation_id?: string | null
            inspection_number?: string | null
          }[]
          const byInspection = new Map<
            string,
            {
              id: string
              category: string
              bureau: string
              date: string
              isOpen: boolean
              inspNum: string
              count: number
              sources: ViolationSource[]
            }
          >()
          for (const row of violRows) {
            const key = row.inspection_number || row.violation_id || Math.random().toString()
            if (byInspection.has(key)) {
              const existing = byInspection.get(key)!
              existing.count++
              existing.sources.push(row as ViolationSource)
              const vs = (row.violation_status ?? row.inspection_status ?? '').toUpperCase()
              if (vs === 'OPEN' || vs === 'FAILED') existing.isOpen = true
            } else {
              const vs = (row.violation_status ?? row.inspection_status ?? '').toUpperCase()
              byInspection.set(key, {
                id: key,
                category: row.inspection_category || 'Violation',
                bureau: row.department_bureau || '',
                date: row.violation_date ?? '',
                isOpen: vs === 'OPEN' || vs === 'FAILED',
                inspNum: row.inspection_number || '',
                count: 1,
                sources: [row as ViolationSource],
              })
            }
          }
          return Array.from(byInspection.values()).map((g) => {
            const label = g.bureau ? `${g.category} · ${g.bureau}` : g.category
            const countStr = g.count > 1 ? ` · ${g.count} violations` : ''
            const inspStr = g.inspNum ? `#${g.inspNum}` : ''
            return {
              id: g.id,
              type: 'Violation' as const,
              label: `${label}${countStr}`,
              date: g.date,
              status: g.isOpen ? 'open' : '',
              detail: inspStr,
              violations: g.sources,
            }
          })
        })(),
        ...(detailData?.recent_permits ?? []).map((pr, idx) => {
          const row = pr as {
            permit_type?: string | null
            issue_date?: string | null
            reported_cost?: number | string | null
            permit_number?: string | null
          }
          const cost =
            row.reported_cost != null && Number(row.reported_cost) > 0
              ? ` — $${Number(row.reported_cost).toLocaleString()}`
              : ''
          return {
            id: row.permit_number ? String(row.permit_number) : `permit-${idx}`,
            type: 'Permit' as const,
            label: `${row.permit_type ?? 'Permit'}${cost}`,
            date: row.issue_date ?? '',
            status: '',
            permit: pr as PermitSource,
          }
        }),
      ]
        .filter((a) => a.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 9)

  const activityKey = (a: ActivityItem) => `${a.type}:${a.id}`
  const effectiveSelectedKey =
    selectedActivityKey && activity.some((a) => activityKey(a) === selectedActivityKey)
      ? selectedActivityKey
      : activity[0]
        ? activityKey(activity[0])
        : null
  const selectedItem =
    activity.find((a) => activityKey(a) === effectiveSelectedKey) ?? null

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const isPbl = p.is_pbl
  const isRestrictedZone = detailData?.is_restricted_zone ?? p.is_restricted_zone
  const strRegistrations =
    detailData?.str_registrations ?? p.str_registrations ?? 0
  const nearbyListings = detailData?.nearby_listings ?? p.nearby_listings ?? 0

  const slug = p.slug || p.canonical_address.replace(/\s+/g, '-')

  const showDetailPanel = showParaphrasedReports && !detailLoading && activity.length > 0

  return (
    <div className="dashboard-detail" ref={ref}>
      <div
        className={`dashboard-detail-inner${showDetailPanel ? ' dashboard-detail-inner--with-reports' : ''}`}
      >
        <div className="dashboard-detail-left">
          <div className="dashboard-dl-addr">
            {p.display_name || p.canonical_address}
          </div>
          <div className="dashboard-dl-hood">{p.community_area || ''}</div>
          {p.address_range && p.address_range !== p.canonical_address && (
            <div className="dashboard-dl-range">{p.address_range}</div>
          )}
          {(p.additional_streets ?? []).length > 0 && !p.address_range && (
            <div className="dashboard-dl-range">{(p.additional_streets ?? []).join(' & ')}</div>
          )}

          <div className="dashboard-dl-group">
            <div className="dashboard-dl-group-label">Building</div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">Class</span>
              <span className="dashboard-dl-val">{p.property_class || 'N/A'}</span>
            </div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">Year built</span>
              <span className="dashboard-dl-val">
                {chars.year_built != null && String(chars.year_built).trim() !== ''
                  ? String(chars.year_built)
                  : 'N/A'}
              </span>
            </div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">Implied value</span>
              <span className="dashboard-dl-val">{money(p.implied_value)}</span>
            </div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">{(p.pins ?? []).length === 1 ? 'Parcel' : 'Parcels'}</span>
              <span className="dashboard-dl-val" style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
                {(p.pins ?? []).length === 1
                  ? (p.pins ?? [''])[0]
                  : (p.pins ?? []).length > 0
                    ? String((p.pins ?? []).length)
                    : 'N/A'}
              </span>
            </div>
          </div>

          <div className="dashboard-dl-group">
            <div className="dashboard-dl-group-label">Short-term rentals</div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">PBL / Restricted zone</span>
              {isPbl ? (
                <span className="dashboard-dl-val dashboard-val-yes">Prohibited</span>
              ) : isRestrictedZone ? (
                <span className="dashboard-dl-val dashboard-val-warn">Restricted</span>
              ) : (
                <span className="dashboard-dl-val dashboard-val-no">No</span>
              )}
            </div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">Registrations</span>
              {strRegistrations > 0 ? (
                <span className="dashboard-dl-val dashboard-val-warn">{strRegistrations} at address</span>
              ) : (
                <span className="dashboard-dl-val dashboard-val-no">None</span>
              )}
            </div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">Listings nearby</span>
              {nearbyListings > 0 ? (
                <button
                  type="button"
                  className="dashboard-dl-val dashboard-val-warn dashboard-val-link"
                  disabled={!onUpgradePrompt && !propertyCoords}
                  title={!onUpgradePrompt && !propertyCoords ? 'Loading map position…' : undefined}
                  onClick={() => {
                    if (onUpgradePrompt) onUpgradePrompt()
                    else setShowListings(true)
                  }}
                >
                  {nearbyListings} within 150m
                </button>
              ) : (
                <span className="dashboard-dl-val dashboard-val-no">None</span>
              )}
            </div>
          </div>

          <div className="dashboard-dl-spacer" />
          <a href={`/address/${encodeURIComponent(slug)}`} className="dashboard-bar-link dashboard-bar-navy">
            Full property page →
          </a>
        </div>

        <div className="dashboard-detail-right">
          <div className="dashboard-dr-top">
            <div className="dashboard-dr-label">Recent activity</div>
            <div className="dashboard-tl">
              {detailLoading ? (
                <div style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>Loading…</div>
              ) : activity.length === 0 ? (
                <div style={{ fontSize: 12, color: '#999', padding: '8px 0' }}>
                  No activity in the last 12 months.
                </div>
              ) : (
                activity.map((a, i) => {
                  const typeDisplay =
                    a.type === 'Violation' ? 'VIOL' : a.type === 'Permit' ? 'PERMIT' : '311'
                  const typeColor =
                    a.type === 'Violation' ? '#c8102e' : a.type === 'Permit' ? '#166534' : '#1e3a5f'
                  const statusKind: StatusKind =
                    a.type === 'Permit'
                      ? 'active'
                      : String(a.status ?? '').toLowerCase() === 'open'
                        ? 'open'
                        : 'closed'
                  const rowKey = activityKey(a)
                  const isSelected = effectiveSelectedKey === rowKey
                  return (
                    <div
                      key={`${a.type}-${i}`}
                      data-activity-row="true"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedActivityKey(rowKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedActivityKey(rowKey)
                          return
                        }
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault()
                          const delta = e.key === 'ArrowDown' ? 1 : -1
                          const nextIndex = Math.max(0, Math.min(activity.length - 1, i + delta))
                          if (nextIndex === i) return
                          setSelectedActivityKey(activityKey(activity[nextIndex]))
                          const parent = e.currentTarget.parentElement
                          const rows = parent?.querySelectorAll<HTMLDivElement>('[data-activity-row="true"]')
                          rows?.[nextIndex]?.focus()
                        }
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '92px 44px 1fr auto',
                        gap: 8,
                        alignItems: 'center',
                        padding: '9px 8px 9px 5px',
                        borderBottom: '1px solid #f0ede5',
                        borderLeft: isSelected ? '3px solid #1e3a5f' : '3px solid transparent',
                        background: isSelected ? '#faf8f3' : 'transparent',
                        fontSize: 13,
                        minWidth: 0,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'background 120ms ease, border-left-color 120ms ease',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 11,
                          color: '#888',
                        }}
                      >
                        {formatDate(a.date)}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 10,
                          fontWeight: 500,
                          letterSpacing: '0.08em',
                          color: typeColor,
                        }}
                      >
                        {typeDisplay}
                      </span>
                      <span style={{ color: '#1a1a1a', minWidth: 0 }}>
                        {a.label}
                        {a.detail ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                              fontSize: 10,
                              color: '#999',
                            }}
                          >
                            {a.detail}
                          </span>
                        ) : null}
                      </span>
                      <StatusPill kind={statusKind} />
                    </div>
                  )
                })
              )}
            </div>
          </div>
          {showHistoricalActivityBar ? (
            <a href={`/address/${encodeURIComponent(slug)}`} className="dashboard-bar-link dashboard-bar-light">
              See all historical activity →
            </a>
          ) : null}
        </div>
        {showDetailPanel && selectedItem ? (() => {
          const monoLabel: CSSProperties = {
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11,
            color: '#5a7898',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }

          const formatShortDate = (iso: string | null | undefined): string => {
            if (!iso) return ''
            const d = new Date(iso)
            if (Number.isNaN(d.getTime())) return ''
            return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
          }

          const ClosedPill = ({ closedDate }: { closedDate: string | null | undefined }) => {
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

          const headerTitle =
            selectedItem.type === '311'
              ? 'Complaint details'
              : selectedItem.type === 'Violation'
                ? 'Violation details'
                : 'Permit details'

          const panelPalette =
            selectedItem.type === 'Violation'
              ? { headerBg: '#fbeeee', headerText: '#7a1a26' }
              : selectedItem.type === 'Permit'
                ? { headerBg: '#eef5ee', headerText: '#166534' }
                : { headerBg: '#eef4fb', headerText: '#1e3a5f' }

          const renderComplaint = () => {
            type WOLIStep = {
              order?: number | null
              step?: string | null
              status?: string | null
              outcome?: string | null
              end_date?: string | null
            }
            type CRow = {
              sr_number?: string | null
              sr_type?: string | null
              status?: string | null
              created_date?: string | null
              closed_date?: string | null
              standard_description?: string | null
              complaint_description?: string | null
              complainant_type?: string | null
              unit_number?: string | null
              danger_reported?: string | null
              owner_notified?: string | null
              owner_occupied?: string | null
              concern_category?: string | null
              problem_category?: string | null
              restaurant_name?: string | null
              business_name?: string | null
              sla_target_days?: number | null
              actual_mean_days?: number | null
              workflow_step?: string | null
              work_order_status?: string | null
              work_order_steps?: WOLIStep[] | null
              final_outcome?: string | null
            }
            const c = (selectedItem.complaint ?? {}) as CRow
            const caseStatus = String(c.status ?? '').toLowerCase()
            const isOpen = caseStatus === 'open'
            const isCanceled = caseStatus === 'canceled' || caseStatus === 'cancelled'
            const desc = (c.standard_description ?? '').trim()
            const rawDesc = (c.complaint_description ?? '').trim()
            const venueName = (c.restaurant_name ?? c.business_name ?? '').trim()
            const steps = Array.isArray(c.work_order_steps) ? c.work_order_steps : []
            const hasSteps = steps.length > 0
            const finalOutcome = (c.final_outcome ?? '').trim()

            // Build "tags" row of structured intake fields (Yes/No flags + categories)
            type Tag = { label: string; value: string; color?: string }
            const tags: Tag[] = []
            if (c.complainant_type) tags.push({ label: 'Filed by', value: c.complainant_type })
            if (c.unit_number) tags.push({ label: 'Unit', value: c.unit_number })
            if (c.danger_reported && c.danger_reported.toLowerCase() === 'yes') {
              tags.push({ label: 'Danger', value: 'Yes', color: '#a82020' })
            }
            if (c.owner_notified) tags.push({ label: 'Owner notified', value: c.owner_notified })
            if (c.owner_occupied) tags.push({ label: 'Owner occupied', value: c.owner_occupied })
            if (c.concern_category) tags.push({ label: 'Concern', value: c.concern_category })
            if (c.problem_category) tags.push({ label: 'Problem', value: c.problem_category })

            return (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <span style={monoLabel}>{formatDate(c.created_date ?? '')}</span>
                  {isOpen ? (
                    <StatusPill kind="open" />
                  ) : isCanceled ? (
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
                        background: '#f5e8e0',
                        color: '#a05a20',
                      }}
                    >
                      Canceled
                    </span>
                  ) : (
                    <ClosedPill closedDate={c.closed_date} />
                  )}
                </div>
                {c.sr_type ? (
                  <div style={{ ...monoLabel, marginBottom: 4, letterSpacing: '0.04em' }}>{c.sr_type}</div>
                ) : null}
                {c.sr_number ? (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontSize: 11,
                      color: '#888',
                      marginBottom: 10,
                    }}
                  >
                    #{c.sr_number}
                  </div>
                ) : null}
                {venueName ? (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1a1a1a',
                      marginBottom: 4,
                    }}
                  >
                    {venueName}
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 13,
                    color: desc ? '#1a1a1a' : '#888',
                    lineHeight: 1.4,
                    marginBottom: rawDesc && rawDesc !== desc ? 6 : 12,
                    fontStyle: desc ? 'normal' : 'italic',
                  }}
                >
                  {desc || 'No description available'}
                </div>
                {rawDesc && rawDesc !== desc ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#666',
                      lineHeight: 1.5,
                      marginBottom: 12,
                      fontStyle: 'italic',
                      paddingLeft: 8,
                      borderLeft: '2px solid #d6e4f3',
                    }}
                  >
                    "{rawDesc}"
                  </div>
                ) : null}

                {/* Structured intake tags */}
                {tags.length > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 4,
                      marginBottom: 12,
                    }}
                  >
                    {tags.map((tag, idx) => (
                      <span
                        key={`tag-${idx}`}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          background: '#fff',
                          border: '1px solid #d6e4f3',
                          borderRadius: 3,
                          color: tag.color ?? '#1a1a1a',
                          lineHeight: 1.4,
                        }}
                      >
                        <span style={{ color: '#5a7898', marginRight: 4 }}>{tag.label}:</span>
                        <span style={{ fontWeight: tag.color ? 600 : 500 }}>{tag.value}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Final outcome banner — surfaced for closed cases */}
                {!isOpen && finalOutcome ? (
                  <div
                    style={{
                      fontSize: 12,
                      padding: '8px 10px',
                      background: isCanceled ? '#f5e8e0' : '#eef4fb',
                      border: `1px solid ${isCanceled ? '#e0c4a8' : '#d6e4f3'}`,
                      borderRadius: 4,
                      marginBottom: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: '#5a7898',
                        marginRight: 6,
                      }}
                    >
                      Outcome
                    </span>
                    <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{finalOutcome}</span>
                  </div>
                ) : null}

                {/* SLA + estimated date for open cases */}
                {isOpen && (c.sla_target_days != null || c.actual_mean_days != null) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: hasSteps ? 12 : 0 }}>
                    {c.sla_target_days != null ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#5a7898' }}>Target</span>
                        <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{c.sla_target_days} days</span>
                      </div>
                    ) : null}
                    {c.actual_mean_days != null ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#5a7898' }}>Avg</span>
                        <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{c.actual_mean_days} days</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Workflow timeline — always shown if we have steps */}
                {hasSteps ? (
                  <div
                    style={{
                      borderTop: '1px solid #d6e4f3',
                      paddingTop: 10,
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: '#5a7898',
                        marginBottom: 8,
                      }}
                    >
                      Workflow ({steps.length} step{steps.length !== 1 ? 's' : ''})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                      {steps.map((step, idx) => {
                        const status = String(step.status ?? '').toLowerCase()
                        const isClosed = status === 'closed'
                        const isCanceledStep = status === 'canceled' || status === 'cancelled'
                        const isInProgress = status === 'in progress'
                        const isNew = status === 'new'
                        const isCurrent =
                          !isClosed && !isCanceledStep &&
                          (isInProgress || (isNew && !steps.slice(0, idx).some((s) => {
                            const ss = String(s.status ?? '').toLowerCase()
                            return ss === 'new' || ss === 'in progress'
                          })))
                        const isFuture = isNew && !isCurrent
                        const isLast = idx === steps.length - 1

                        const dotColor = isClosed
                          ? '#166534'
                          : isCanceledStep
                            ? '#a05a20'
                            : isCurrent
                              ? '#1e3a5f'
                              : '#c4c0b4'

                        const stepColor = isFuture ? '#999' : '#1a1a1a'
                        const outcomeText = (step.outcome ?? '').trim()

                        return (
                          <div
                            key={`step-${idx}`}
                            style={{
                              display: 'flex',
                              gap: 10,
                              paddingBottom: isLast ? 0 : 10,
                              position: 'relative',
                            }}
                          >
                            {/* Timeline dot + line */}
                            <div
                              style={{
                                width: 14,
                                flexShrink: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                paddingTop: 2,
                              }}
                            >
                              <div
                                style={{
                                  width: 9,
                                  height: 9,
                                  borderRadius: '50%',
                                  background: isCurrent ? '#fff' : dotColor,
                                  border: `2px solid ${dotColor}`,
                                  flexShrink: 0,
                                  animation: isCurrent ? 'pulse 2s ease-in-out infinite' : undefined,
                                }}
                              />
                              {!isLast ? (
                                <div
                                  style={{
                                    width: 1,
                                    flex: 1,
                                    background: '#d6e4f3',
                                    marginTop: 2,
                                  }}
                                />
                              ) : null}
                            </div>
                            {/* Step content */}
                            <div style={{ flex: 1, minWidth: 0, paddingTop: 0 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'baseline',
                                  gap: 8,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: stepColor,
                                    fontWeight: isCurrent ? 600 : 500,
                                  }}
                                >
                                  {step.step ?? '(unnamed step)'}
                                </span>
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                                    fontSize: 9,
                                    color: dotColor,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                    flexShrink: 0,
                                  }}
                                >
                                  {isCurrent ? 'Current' : step.status ?? ''}
                                </span>
                              </div>
                              {outcomeText ? (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: '#5a7898',
                                    marginTop: 2,
                                    lineHeight: 1.4,
                                    fontStyle: 'italic',
                                  }}
                                >
                                  "{outcomeText}"
                                </div>
                              ) : null}
                              {step.end_date ? (
                                <div
                                  style={{
                                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                                    fontSize: 9,
                                    color: '#999',
                                    marginTop: 2,
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  {formatDate(step.end_date)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : c.workflow_step ? (
                  /* Fallback: only workflow_step is known, no full timeline yet */
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
                    <span style={{ color: '#5a7898', flexShrink: 0 }}>Step</span>
                    <span style={{ color: '#1a1a1a', fontWeight: 500, textAlign: 'right' }}>{c.workflow_step}</span>
                  </div>
                ) : null}
              </>
            )
          }

          const renderViolation = () => {
            type VRow = {
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
            const vols = (selectedItem.violations ?? []) as VRow[]
            if (vols.length === 0) {
              return (
                <div style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>No description available</div>
              )
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
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <span style={monoLabel}>{formatDate(first.violation_date ?? '')}</span>
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

          const renderPermit = () => {
            type PRow = {
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
            const pr = (selectedItem.permit ?? {}) as PRow
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
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <span style={monoLabel}>{formatDate(pr.issue_date ?? '')}</span>
                  <StatusPill kind={expiry?.isExpired ? 'expired' : 'active'} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>{pr.permit_type ?? '—'}</div>
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
                      <span style={{ color: expiry.isExpired ? '#a82020' : '#1a1a1a', fontWeight: 500 }}>{expiry.label}</span>
                    </div>
                  ) : null}
                  {pr.reported_cost != null && Number(pr.reported_cost) > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#5a7898' }}>Cost</span>
                      <span style={{ color: '#1a1a1a', fontWeight: 500 }}>${Number(pr.reported_cost).toLocaleString()}</span>
                    </div>
                  ) : null}
                  {pr.total_fee != null && Number(pr.total_fee) > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#5a7898' }}>Fee</span>
                      <span style={{ color: '#1a1a1a', fontWeight: 500 }}>${Number(pr.total_fee).toLocaleString()}</span>
                    </div>
                  ) : null}
                  {pr.contact_1_name ? (
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8, marginTop: 4 }}
                    >
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
                      <span style={{ color: '#1a1a1a', fontWeight: 500, textAlign: 'right' }}>{pr.contact_1_name}</span>
                    </div>
                  ) : null}
                </div>
              </>
            )
          }

          return (
            <div className="dashboard-detail-reports" style={{ background: '#faf8f3' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  color: panelPalette.headerText,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  background: panelPalette.headerBg,
                  padding: '8px 12px',
                  borderRadius: 4,
                  marginBottom: 16,
                }}
              >
                {headerTitle}
              </div>
              {selectedItem.type === '311'
                ? renderComplaint()
                : selectedItem.type === 'Violation'
                  ? renderViolation()
                  : renderPermit()}
            </div>
          )
        })() : null}
      </div>
      {showListings && propertyCoords ? (
        <NearbyListingsModal
          isOpen={showListings}
          onClose={() => setShowListings(false)}
          address={p.display_name || p.canonical_address}
          lat={propertyCoords.lat}
          lng={propertyCoords.lng}
        />
      ) : null}
    </div>
  )
}
