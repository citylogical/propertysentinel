'use client'

import { useEffect, useRef, useState } from 'react'
import NearbyListingsModal from '@/components/NearbyListingsModal'
import UpgradeModal from '@/components/UpgradeModal'
import ComplaintDetail, { type ComplaintDetailRecord } from './details/ComplaintDetail'
import ViolationDetail, { type ViolationDetailRecord } from './details/ViolationDetail'
import PermitDetail, { type PermitDetailRecord } from './details/PermitDetail'
import { StatusPill, formatDate, type StatusKind } from './details/_shared'
import type { PortfolioProperty } from './types'

type Props = {
  property: PortfolioProperty
  onClose: () => void
  /** When set, fetches activity from this URL instead of the authenticated dashboard detail API. */
  detailEndpoint?: string
  /** When false, hides the foot link under recent activity (e.g. public audit). Defaults to true. */
  showHistoricalActivityBar?: boolean
  /** When true, renders the third item-detail column (workflow timeline, outcome, structured intake tags). */
  showItemDetails?: boolean
  /** When provided, the "Listings nearby" button calls this instead of opening the listings map. Audit-only gate. */
  onUpgradePrompt?: () => void
  /** When true, surfaces tenant-PII fields (raw description, unit, complainant type, danger flag, owner notified/occupied). Defaults to false (public-safe). */
  isAdmin?: boolean
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

export default function PortfolioDetail({
  property: p,
  onClose: _onClose,
  detailEndpoint,
  showHistoricalActivityBar = true,
  showItemDetails = false,
  onUpgradePrompt,
  isAdmin = false,
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

  const isPbl = p.is_pbl
  const isRestrictedZone = detailData?.is_restricted_zone ?? p.is_restricted_zone
  const strRegistrations =
    detailData?.str_registrations ?? p.str_registrations ?? 0
  const nearbyListings = detailData?.nearby_listings ?? p.nearby_listings ?? 0

  const slug = p.slug || p.canonical_address.replace(/\s+/g, '-')

  const showDetailPanel = showItemDetails && !detailLoading && activity.length > 0

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
              {selectedItem.type === '311' ? (
                <ComplaintDetail
                  complaint={(selectedItem.complaint ?? {}) as ComplaintDetailRecord}
                  isAdmin={isAdmin}
                />
              ) : selectedItem.type === 'Violation' ? (
                <ViolationDetail
                  violations={(selectedItem.violations ?? []) as ViolationDetailRecord[]}
                />
              ) : (
                <PermitDetail permit={(selectedItem.permit ?? {}) as PermitDetailRecord} />
              )}
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
