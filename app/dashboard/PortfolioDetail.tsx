'use client'

import { useEffect, useRef, useState } from 'react'
import NearbyListingsModal from '@/components/NearbyListingsModal'
import type { PortfolioProperty } from './types'

type Props = {
  property: PortfolioProperty
  onClose: () => void
  /** When set, fetches activity from this URL instead of the authenticated dashboard detail API. */
  detailEndpoint?: string
  /** When false, hides the foot link under recent activity (e.g. public audit). Defaults to true. */
  showHistoricalActivityBar?: boolean
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

type ActivityItem = {
  type: '311' | 'Violation' | 'Permit'
  label: string
  date: string
  status: string
  detail?: string
}

export default function PortfolioDetail({
  property: p,
  onClose: _onClose,
  detailEndpoint,
  showHistoricalActivityBar = true,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [detailData, setDetailData] = useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [showListings, setShowListings] = useState(false)
  const [propertyCoords, setPropertyCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
        ...(detailData?.recent_complaints ?? []).map((c) => {
          const row = c as {
            sr_type?: string | null
            created_date?: string | null
            sr_number?: string | null
            status?: string | null
          }
          return {
            type: '311' as const,
            label: row.sr_type ?? 'Complaint',
            date: row.created_date ?? '',
            status: row.status ?? '',
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
              category: string
              bureau: string
              date: string
              isOpen: boolean
              inspNum: string
              count: number
            }
          >()
          for (const row of violRows) {
            const key = row.inspection_number || row.violation_id || Math.random().toString()
            if (byInspection.has(key)) {
              const existing = byInspection.get(key)!
              existing.count++
              const vs = (row.violation_status ?? row.inspection_status ?? '').toUpperCase()
              if (vs === 'OPEN' || vs === 'FAILED') existing.isOpen = true
            } else {
              const vs = (row.violation_status ?? row.inspection_status ?? '').toUpperCase()
              byInspection.set(key, {
                category: row.inspection_category || 'Violation',
                bureau: row.department_bureau || '',
                date: row.violation_date ?? '',
                isOpen: vs === 'OPEN' || vs === 'FAILED',
                inspNum: row.inspection_number || '',
                count: 1,
              })
            }
          }
          return Array.from(byInspection.values()).map((g) => {
            const label = g.bureau ? `${g.category} · ${g.bureau}` : g.category
            const countStr = g.count > 1 ? ` · ${g.count} violations` : ''
            const inspStr = g.inspNum ? `#${g.inspNum}` : ''
            return {
              type: 'Violation' as const,
              label: `${label}${countStr}`,
              date: g.date,
              status: g.isOpen ? 'open' : '',
              detail: inspStr,
            }
          })
        })(),
        ...(detailData?.recent_permits ?? []).map((pr) => {
          const row = pr as {
            permit_type?: string | null
            issue_date?: string | null
            reported_cost?: number | string | null
          }
          const cost =
            row.reported_cost != null && Number(row.reported_cost) > 0
              ? ` — $${Number(row.reported_cost).toLocaleString()}`
              : ''
          return {
            type: 'Permit' as const,
            label: `${row.permit_type ?? 'Permit'}${cost}`,
            date: row.issue_date ?? '',
            status: '',
          }
        }),
      ]
        .filter((a) => a.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 9)

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

  return (
    <div className="dashboard-detail" ref={ref}>
      <div className="dashboard-detail-inner">
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
                  disabled={!propertyCoords}
                  title={!propertyCoords ? 'Loading map position…' : undefined}
                  onClick={() => setShowListings(true)}
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
                activity.map((a, i) => (
                  <div className="dashboard-tl-row" key={`${a.type}-${i}`}>
                    <div className="dashboard-tl-date">{formatDate(a.date)}</div>
                    <div className="dashboard-tl-type">{a.type}</div>
                    <div className="dashboard-tl-desc">
                      {a.label}
                      {a.status && String(a.status).toLowerCase() === 'open' ? ' — open' : ''}
                      {a.detail ? <span className="dashboard-tl-detail">{a.detail}</span> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {showHistoricalActivityBar ? (
            <a href={`/address/${encodeURIComponent(slug)}`} className="dashboard-bar-link dashboard-bar-light">
              See all historical activity →
            </a>
          ) : null}
        </div>
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
