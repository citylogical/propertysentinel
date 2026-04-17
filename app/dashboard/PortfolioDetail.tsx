'use client'

import { useEffect, useRef, useState } from 'react'
import type { PortfolioProperty } from './types'

type Props = {
  property: PortfolioProperty
  onClose: () => void
}

type DetailPayload = {
  recent_complaints?: Record<string, unknown>[]
  recent_violations?: Record<string, unknown>[]
  recent_permits?: Record<string, unknown>[]
  latest_violation_date?: string | null
  latest_permit_date?: string | null
}

export default function PortfolioDetail({ property: p, onClose: _onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [detailData, setDetailData] = useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [p.id])

  useEffect(() => {
    setDetailLoading(true)
    setDetailData(null)
    fetch(`/api/dashboard/detail?id=${encodeURIComponent(p.id)}`)
      .then((res) => res.json())
      .then((data: DetailPayload & { error?: string }) => {
        if (data.error) setDetailData(null)
        else setDetailData(data)
      })
      .catch(() => setDetailData(null))
      .finally(() => setDetailLoading(false))
  }, [p.id])

  const money = (val: number | null) =>
    val != null && Number.isFinite(val) ? `$${val.toLocaleString()}` : 'N/A'

  const chars = (p.building_chars ?? {}) as Record<string, unknown>

  const activity = detailLoading
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
        ...(detailData?.recent_violations ?? []).map((v) => {
          const row = v as {
            inspection_category?: string | null
            violation_date?: string | null
            violation_status?: string | null
          }
          return {
            type: 'Violation' as const,
            label: row.inspection_category || 'Violation',
            date: row.violation_date ?? '',
            status: row.violation_status ?? '',
          }
        }),
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
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const isPbl = p.is_pbl
  const shvrCount = p.shvr_count ?? 0

  const slug = p.slug || p.canonical_address.replace(/\s+/g, '-')

  return (
    <div className="dashboard-detail" ref={ref}>
      <div className="dashboard-detail-inner">
        <div className="dashboard-detail-left">
          <div className="dashboard-dl-addr">
            {p.display_name || p.address_range || p.canonical_address}
          </div>
          <div className="dashboard-dl-hood">{p.community_area || ''}</div>

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
              <span className="dashboard-dl-key">Assessed (2024)</span>
              <span className="dashboard-dl-val">
                {money(
                  p.implied_value != null && p.implied_value > 0 ? Math.round(p.implied_value / 10) : null
                )}
              </span>
            </div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">Implied market value</span>
              <span className="dashboard-dl-val">{money(p.implied_value)}</span>
            </div>
          </div>

          <div className="dashboard-dl-group">
            <div className="dashboard-dl-group-label">Short-term rentals</div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">Prohibited bldg list</span>
              {isPbl ? (
                <span className="dashboard-dl-val dashboard-val-yes">YES</span>
              ) : (
                <span className="dashboard-dl-val dashboard-val-no">No</span>
              )}
            </div>
            <div className="dashboard-dl-row">
              <span className="dashboard-dl-key">SHVR complaints</span>
              {shvrCount > 0 ? (
                <span className="dashboard-dl-val dashboard-val-warn">{shvrCount} active</span>
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
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <a href={`/address/${encodeURIComponent(slug)}`} className="dashboard-bar-link dashboard-bar-light">
            See all historical activity →
          </a>
        </div>
      </div>
    </div>
  )
}
