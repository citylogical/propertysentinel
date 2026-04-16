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

export default function PortfolioDetail({ property: p, onClose }: Props) {
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

  const na = (val: unknown) => (val != null && String(val).trim() !== '' ? String(val) : 'N/A')
  const money = (val: number | null) => (val != null && Number.isFinite(val) ? `$${val.toLocaleString()}` : 'N/A')
  const date = (val: string | null | undefined) => {
    if (!val) return 'N/A'
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return 'N/A'
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const chars = (p.building_chars ?? {}) as Record<string, unknown>

  const activity = detailLoading
    ? []
    : [
        ...(detailData?.recent_complaints ?? []).map((c) => {
          const row = c as { sr_type?: string | null; created_date?: string | null; sr_number?: string | null; status?: string | null }
          return {
            type: 'complaint' as const,
            label: row.sr_type ?? 'Complaint',
            date: row.created_date ?? '',
            detail: row.sr_number ? `#${row.sr_number}` : '',
            color: String(row.status ?? '').toLowerCase() === 'open' ? 'var(--amber)' : 'var(--text-dim)',
          }
        }),
        ...(detailData?.recent_violations ?? []).map((v) => {
          const row = v as {
            inspection_category?: string | null
            department_bureau?: string | null
            violation_date?: string | null
            violation_status?: string | null
            inspection_status?: string | null
          }
          const cat = row.inspection_category || 'Violation'
          const dept = row.department_bureau || ''
          return {
            type: 'violation' as const,
            label: `${cat}${dept ? ` · ${dept}` : ''}`.trim(),
            date: row.violation_date ?? '',
            detail: String(row.violation_status ?? row.inspection_status ?? ''),
            color:
              String(row.violation_status ?? row.inspection_status ?? '')
                .toUpperCase()
                .includes('OPEN') || String(row.violation_status ?? '').toUpperCase() === 'FAILED'
                ? 'var(--red)'
                : 'var(--text-dim)',
          }
        }),
        ...(detailData?.recent_permits ?? []).map((pr) => {
          const row = pr as {
            permit_type?: string | null
            issue_date?: string | null
            reported_cost?: number | string | null
          }
          return {
            type: 'permit' as const,
            label: row.permit_type ?? 'Permit',
            date: row.issue_date ?? '',
            detail:
              row.reported_cost != null && Number(row.reported_cost) > 0
                ? `$${Number(row.reported_cost).toLocaleString()}`
                : '',
            color: 'var(--green)',
          }
        }),
      ]
        .filter((a) => a.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8)

  const additional = p.additional_streets ?? []

  return (
    <div className="portfolio-detail" ref={ref}>
      <div className="portfolio-detail-header">
        <span className="portfolio-detail-title">
          {p.display_name || p.canonical_address}
          {p.address_range ? ` — ${p.address_range}` : ''}
        </span>
        <button type="button" className="portfolio-detail-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
      <div className="portfolio-detail-body">
        <div className="portfolio-detail-section">
          <h3>Compliance summary</h3>
          <div className="portfolio-detail-row">
            <span>PBL status</span>
            <span className={p.is_pbl ? 'portfolio-val-red' : ''}>
              {p.is_pbl ? 'On Prohibited Buildings List' : 'Not on PBL'}
            </span>
          </div>
          <div className="portfolio-detail-row">
            <span>SHVR complaints</span>
            <span className={p.shvr_count > 0 ? 'portfolio-val-red' : ''}>
              {p.shvr_count > 0 ? `${p.shvr_count} active` : 'None'}
            </span>
          </div>
          <div className="portfolio-detail-row">
            <span>Open violations</span>
            <span className={p.open_violations > 0 ? 'portfolio-val-red' : ''}>{p.open_violations}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Stop work orders</span>
            <span className={p.has_stop_work ? 'portfolio-val-red' : ''}>{p.has_stop_work ? 'Active' : 'None'}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Open 311 complaints</span>
            <span>{p.open_complaints}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Total permits</span>
            <span>{p.total_permits}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Last violation</span>
            <span>{detailLoading ? '…' : date(detailData?.latest_violation_date)}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Last permit</span>
            <span>{detailLoading ? '…' : date(detailData?.latest_permit_date)}</span>
          </div>
        </div>

        <div className="portfolio-detail-section">
          <h3>
            Property overview
            <button
              type="button"
              className="portfolio-detail-gear"
              title="Edit property details"
              onClick={(e) => {
                e.stopPropagation()
                alert('Edit modal coming soon')
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
          </h3>
          <div className="portfolio-detail-row">
            <span>Name</span>
            <span>{na(p.display_name)}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Address</span>
            <span>{na(p.address_range || p.canonical_address)}</span>
          </div>
          {additional.length > 0 && (
            <div className="portfolio-detail-row">
              <span>Additional streets</span>
              <span>{additional.join(', ')}</span>
            </div>
          )}
          <div className="portfolio-detail-row">
            <span>Class</span>
            <span>{na(p.property_class)}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Year built</span>
            <span>{na(chars.year_built)}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Units</span>
            <span>
              {p.units_override != null ? p.units_override.toLocaleString() : na(chars.num_apartments)}
            </span>
          </div>
          <div className="portfolio-detail-row">
            <span>Building sqft</span>
            <span>
              {p.sqft_override != null
                ? p.sqft_override.toLocaleString()
                : chars.building_sqft != null && String(chars.building_sqft) !== ''
                  ? Number(chars.building_sqft).toLocaleString()
                  : 'N/A'}
            </span>
          </div>
          <div className="portfolio-detail-row">
            <span>Property type</span>
            <span>{na(chars.type_of_residence)}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Implied value</span>
            <span>{money(p.implied_value)}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>Community area</span>
            <span>{na(p.community_area)}</span>
          </div>
          <div className="portfolio-detail-row">
            <span>PINs</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>
              {p.pins?.length ? `${p.pins.length} parcels` : 'N/A'}
            </span>
          </div>
          {p.notes && (
            <div className="portfolio-detail-row">
              <span>Notes</span>
              <span>{p.notes}</span>
            </div>
          )}
        </div>

        <div className="portfolio-detail-section">
          <h3>Upcoming deadlines</h3>
          {p.has_stop_work && (
            <div className="portfolio-deadline-item">
              <div className="portfolio-deadline-dot urgent" />
              <div className="portfolio-deadline-text">
                <div className="portfolio-deadline-label">Active stop work order</div>
                <div className="portfolio-deadline-sub">Must be resolved before any work continues</div>
              </div>
              <div className="portfolio-deadline-date">Overdue</div>
            </div>
          )}
          {p.open_violations > 0 && (
            <div className="portfolio-deadline-item">
              <div className={`portfolio-deadline-dot ${p.open_violations > 10 ? 'urgent' : 'soon'}`} />
              <div className="portfolio-deadline-text">
                <div className="portfolio-deadline-label">
                  {p.open_violations} open violation{p.open_violations !== 1 ? 's' : ''}
                </div>
                <div className="portfolio-deadline-sub">
                  Last violation: {detailLoading ? '…' : date(detailData?.latest_violation_date)}
                </div>
              </div>
            </div>
          )}
          {!p.has_stop_work && p.open_violations === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No urgent deadlines</div>
          )}
        </div>

        <div className="portfolio-detail-section">
          <h3>Recent activity</h3>
          {detailLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>Loading…</div>
          ) : activity.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No recent activity</div>
          ) : (
            activity.map((a, i) => (
              <div className="portfolio-activity-row" key={`${a.type}-${i}`}>
                <div className="portfolio-activity-dot" style={{ background: a.color }} />
                <div className="portfolio-activity-text">{a.label}</div>
                <div className="portfolio-activity-time">{date(a.date)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
