'use client'

import { useState } from 'react'
import type { ComplaintRow, ViolationRow, PermitRow } from '@/lib/supabase-search'

const PAGE_SIZE = 5

/** Locale-independent YYYY-MM-DD. Avoids hydration mismatch. */
function formatDateISO(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().split('T')[0]
}

/** Locale-independent date + time (24h). Avoids hydration mismatch. */
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return formatDateTime(iso)
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return formatDateISO(iso)
}

function isOpen(status: string | null): boolean {
  return (status ?? '').toUpperCase() === 'OPEN'
}

function isViolationStatusOpen(status: string | null): boolean {
  return (status ?? '').toUpperCase() === 'OPEN'
}

function violationStatusClass(status: string | null): 'open' | 'completed' {
  const s = (status ?? '').toUpperCase()
  return s === 'OPEN' ? 'open' : 'completed'
}

function permitStatusClass(status: string | null): 'active' | 'expired' | 'other' {
  const s = (status ?? '').toUpperCase()
  if (s === 'ISSUED' || s === 'ACTIVE') return 'active'
  if (s === 'EXPIRED' || s === 'REVOKED') return 'expired'
  return 'other'
}

type PropertyFeedProps = {
  complaints: ComplaintRow[]
  complaintsOpenCount: number
  violations: ViolationRow[]
  violationsOpenCount: number
  violationsCompliedCount: number
  permits: PermitRow[]
  propertyZip: string | null
  currentSlug: string
  /** Server timestamp for stable first-render (avoids hydration mismatch). */
  serverTime?: number
}

export default function PropertyFeed({
  complaints,
  complaintsOpenCount,
  violations,
  violationsOpenCount,
  violationsCompliedCount,
  permits,
  propertyZip,
  currentSlug,
  serverTime,
}: PropertyFeedProps) {
  const [activeTab, setActiveTab] = useState<'311' | 'violations' | 'permits'>('311')
  const [visible311, setVisible311] = useState(PAGE_SIZE)
  const [visibleViolations, setVisibleViolations] = useState(PAGE_SIZE)
  const [visiblePermits, setVisiblePermits] = useState(PAGE_SIZE)

  const visibleComplaints = complaints.slice(0, visible311)
  const hasMore311 = complaints.length > visible311
  const visibleViolationsList = violations.slice(0, visibleViolations)
  const hasMoreViolations = violations.length > visibleViolations
  const visiblePermitsList = permits.slice(0, visiblePermits)
  const hasMorePermits = permits.length > visiblePermits

  return (
    <div className="feed">
      <div className="tabs-bar">
        <button
          type="button"
          className={`tab ${activeTab === '311' ? 'active' : ''}`}
          onClick={() => setActiveTab('311')}
        >
          311 Complaints <span className="tab-pill red">{complaints.length}</span>
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'violations' ? 'active' : ''}`}
          onClick={() => setActiveTab('violations')}
        >
          Violations <span className="tab-pill amber">{violations.length}</span>
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'permits' ? 'active' : ''}`}
          onClick={() => setActiveTab('permits')}
        >
          Permits <span className="tab-pill">{permits.length}</span>
        </button>
      </div>

      {/* 311 panel */}
      <div className={`tab-panel ${activeTab === '311' ? 'active' : ''}`} id="panel-311">
        <div className="feed-body">
          <div className="feed-meta-bar">
            <span className="feed-count">
              <strong>{complaints.length}</strong> complaints · <strong>{complaintsOpenCount}</strong> open
            </span>
            <span className="feed-window-note">All time</span>
          </div>

          {complaints.length === 0 ? (
            <div className="empty-state">
              No 311 complaints on record for this address.
            </div>
          ) : (
            <>
              {visibleComplaints.map((c) => {
                const statusClass = isOpen(c.status) ? 'open' : 'completed'

                return (
                  <div key={c.sr_number} className="complaint">
                    <div>
                      <div className="complaint-type-name">{c.sr_type ?? '—'}</div>
                      <div className="complaint-dept">
                        {[c.owner_department, c.origin].filter(Boolean).join(' · ')}
                      </div>
                      <div className="complaint-dates">
                        <span>Filed: <strong>{formatDate(c.created_date)}</strong></span>
                        {c.closed_date && (
                          <span>Closed: <strong>{formatDate(c.closed_date)}</strong></span>
                        )}
                      </div>
                      <div className="complaint-sr">#{c.sr_number}</div>
                    </div>
                    <div className={`status-badge ${statusClass}`}>
                      {isOpen(c.status) ? 'Open' : 'Completed'}
                    </div>
                  </div>
                )
              })}
              {hasMore311 && (
                <div className="feed-more-wrap">
                  <button
                    type="button"
                    className="feed-more-btn"
                    onClick={() => setVisible311((n) => n + PAGE_SIZE)}
                  >
                    Show 5 more
                  </button>
                </div>
              )}
              <div className="feed-nudge" id="nudge-311">
                Subscribe to get alerted the moment a new complaint is filed at this address.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Violations panel */}
      <div className={`tab-panel ${activeTab === 'violations' ? 'active' : ''}`} id="panel-violations">
        <div className="feed-body">
          <div className="feed-meta-bar">
            <span className="feed-count">
              <strong>{violationsOpenCount}</strong> open / <strong>{violationsCompliedCount}</strong> complied
            </span>
            <span className="feed-window-note">All time</span>
          </div>

          {violations.length === 0 ? (
            <div className="empty-state">
              No building violations on record for this address.
            </div>
          ) : (
            <>
              {visibleViolationsList.map((v, i) => {
                const statusClass = violationStatusClass(v.violation_status)

                return (
                  <div key={v.inspection_number ?? i} className="complaint">
                    <div>
                      <div className="complaint-type-name">{v.violation_description ?? '—'}</div>
                      {v.is_stop_work_order === true && (
                        <span className="status-badge status-badge-stop-work" aria-label="Stop work order">
                          ⚠ STOP WORK ORDER
                        </span>
                      )}
                      {v.violation_inspector_comments && (
                        <div className="complaint-comment">{v.violation_inspector_comments}</div>
                      )}
                      {v.violation_ordinance && (
                        <div className="complaint-ordinance">{v.violation_ordinance}</div>
                      )}
                      <div className="complaint-dept">{v.inspection_category ?? '—'}</div>
                      {v.department_bureau && (
                        <div className="complaint-dept complaint-dept-secondary">{v.department_bureau}</div>
                      )}
                      <div className="complaint-dates">
                        {v.violation_date != null && (
                          <span>Issued: <strong>{formatDateShort(v.violation_date)}</strong></span>
                        )}
                        {isViolationStatusOpen(v.violation_status) && v.violation_last_modified_date != null && (
                          <span>Last Modified: <strong>{formatDateShort(v.violation_last_modified_date)}</strong></span>
                        )}
                        {(v.violation_status ?? '').toUpperCase() === 'COMPLIED' && v.violation_last_modified_date != null && (
                          <span>Closed: <strong>{formatDateShort(v.violation_last_modified_date)}</strong></span>
                        )}
                      </div>
                      <div className="complaint-sr">
                        {v.inspection_number ? `Inspection #${v.inspection_number}` : '—'}
                      </div>
                    </div>
                    <div className={`status-badge ${statusClass}`}>
                      {v.violation_status ?? '—'}
                    </div>
                  </div>
                )
              })}
              {hasMoreViolations && (
                <div className="feed-more-wrap">
                  <button
                    type="button"
                    className="feed-more-btn"
                    onClick={() => setVisibleViolations((n) => n + PAGE_SIZE)}
                  >
                    Show 5 more
                  </button>
                </div>
              )}
              <div className="feed-nudge">
                Subscribe to be alerted the moment a violation is issued at this address.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Permits panel */}
      <div className={`tab-panel ${activeTab === 'permits' ? 'active' : ''}`} id="panel-permits">
        <div className="feed-body">
          <div className="feed-meta-bar">
            <span className="feed-count"><strong>{permits.length}</strong> permits on record</span>
            <span className="feed-window-note">All time</span>
          </div>

          {permits.length === 0 ? (
            <div className="empty-state">
              No building permits found for this address.<br />
              Permit data is updated weekly.
            </div>
          ) : (
            <>
              {visiblePermitsList.map((p, i) => {
                const statusClass = permitStatusClass(p.permit_status)
                const workDesc = (p.work_description ?? '').trim()
                const workDescTruncated = workDesc.length > 120 ? `${workDesc.slice(0, 120)}…` : workDesc
                return (
                  <div key={p.permit_number ?? i} className="complaint">
                    <div>
                      <div className="complaint-type-name">{p.permit_type ?? '—'}</div>
                      {workDescTruncated && (
                        <div className="complaint-comment" style={{ maxWidth: '100%' }}>{workDescTruncated}</div>
                      )}
                      {p.issue_date != null && (
                        <div className="complaint-dates">
                          <span>Issued: <strong>{formatDateShort(p.issue_date)}</strong></span>
                        </div>
                      )}
                      <div className="complaint-sr">
                        {p.permit_number ? `#${p.permit_number}` : '—'}
                      </div>
                    </div>
                    <div className={`status-badge status-badge-permit-${statusClass}`}>
                      {p.permit_status ?? '—'}
                    </div>
                  </div>
                )
              })}
              {hasMorePermits && (
                <div className="feed-more-wrap">
                  <button
                    type="button"
                    className="feed-more-btn"
                    onClick={() => setVisiblePermits((n) => n + PAGE_SIZE)}
                  >
                    Show 5 more
                  </button>
                </div>
              )}
              <div className="feed-nudge">
                Subscribe to be alerted the moment a permit is pulled at this address.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
