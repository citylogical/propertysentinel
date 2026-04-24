'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EnrichedComplaint } from '@/components/ComplaintEnrichmentBlock'
import ComplaintEnrichmentBlock from '@/components/ComplaintEnrichmentBlock'
import type { ComplaintRow, ViolationRow, PermitRow } from '@/lib/supabase-search'
import { isDefaultVisible } from '@/lib/sr-codes'

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

function ViolationGroups({
  violations,
  visibleCount,
  onShowMore,
}: {
  violations: ViolationRow[]
  visibleCount: number
  onShowMore: () => void
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const groups: {
    key: string
    inspectionNumber: string | null
    category: string
    bureau: string
    date: string
    closedDate: string | null
    violations: ViolationRow[]
    hasStopWork: boolean
    overallStatus: string
  }[] = []

  const groupMap = new Map<string, ViolationRow[]>()
  const order: string[] = []

  for (const v of violations) {
    const key = v.inspection_number ?? `ungrouped-${Math.random()}`
    if (!groupMap.has(key)) {
      groupMap.set(key, [])
      order.push(key)
    }
    groupMap.get(key)!.push(v)
  }

  for (const key of order) {
    const vols = groupMap.get(key)!
    const first = vols[0]
    const hasOpen = vols.some(v => {
      const s = (v.violation_status ?? '').toUpperCase()
      return s === 'OPEN' || s === 'FAILED'
    })
    const allComplied = vols.every(v => {
      const s = (v.violation_status ?? '').toUpperCase()
      return s === 'COMPLIED' || s === 'PASSED' || s === 'CLOSED'
    })
    const closedDate = allComplied ? (first.violation_last_modified_date ?? null) : null

    groups.push({
      key,
      inspectionNumber: first.inspection_number,
      category: first.inspection_category ?? '—',
      bureau: first.department_bureau ?? '',
      date: first.violation_date ?? '',
      closedDate,
      violations: vols,
      hasStopWork: vols.some(v => v.is_stop_work_order === true),
      overallStatus: hasOpen ? 'OPEN' : allComplied ? 'COMPLIED' : (first.violation_status ?? '—'),
    })
  }

  const visibleGroups = groups.slice(0, visibleCount)
  const hasMore = groups.length > visibleCount

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <>
      {visibleGroups.map((g) => {
        const isOpen = expandedKeys.has(g.key)
        const statusClass = violationStatusClass(g.overallStatus)

        return (
          <div key={g.key} className="complaint" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
            <button
              type="button"
              onClick={() => toggle(g.key)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="complaint-type-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {isOpen ? '▼' : '▶'}
                  </span>
                  {g.category}{g.bureau ? ` · ${g.bureau}` : ''}
                </div>
                {g.hasStopWork && (
                  <span className="status-badge status-badge-stop-work" aria-label="Stop work order" style={{ marginTop: 4, marginLeft: 17, display: 'inline-block' }}>
                    ⚠ STOP WORK ORDER
                  </span>
                )}
                <div className="complaint-dates" style={{ marginTop: 6, marginLeft: 17 }}>
                  {g.date && (
                    <span>Issued: <strong>{formatDateShort(g.date)}</strong></span>
                  )}
                  {g.closedDate && (
                    <span>Closed: <strong>{formatDateShort(g.closedDate)}</strong></span>
                  )}
                </div>
                <div className="complaint-sr" style={{ marginLeft: 17 }}>
                  {g.inspectionNumber ? `Inspection #${g.inspectionNumber}` : '—'}
                  {' · '}{g.violations.length} violation{g.violations.length !== 1 ? 's' : ''}
                </div>
                {g.violations[0]?.violation_ordinance && (
                  <div style={{ marginTop: 4, marginLeft: 17, fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    {g.violations[0].violation_ordinance}
                  </div>
                )}
              </div>
              <div className={`status-badge ${statusClass}`} style={{ flexShrink: 0, marginTop: 2 }}>
                {g.overallStatus}
              </div>
            </button>

            {isOpen && (
              <div style={{
                borderTop: '1px solid var(--border, #e5e5e0)',
                padding: '8px 16px 12px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                textAlign: 'left',
              }}>
                {g.violations.map((v, vi) => (
                  <div key={vi} style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: 'var(--text, #1a2332)',
                    padding: '6px 0',
                    borderBottom: vi < g.violations.length - 1 ? '0.5px solid var(--border, #e5e5e0)' : 'none',
                  }}>
                    {v.violation_code && (
                      <span style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 9,
                        color: 'var(--text-dim)',
                        flexShrink: 0,
                        minWidth: 48,
                      }}>
                        {v.violation_code}
                      </span>
                    )}
                    <span>{v.violation_inspector_comments || v.violation_description || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {hasMore && (
        <div className="feed-more-wrap">
          <button
            type="button"
            className="feed-more-btn"
            onClick={onShowMore}
          >
            Show 5 more
          </button>
        </div>
      )}
      <div className="feed-nudge">
        Subscribe to be alerted the moment a violation is issued at this address.
      </div>
    </>
  )
}

function computePermitExpiry(issueDate: string | null): { label: string; isExpired: boolean } | null {
  if (!issueDate) return null
  const d = new Date(issueDate)
  if (Number.isNaN(d.getTime())) return null
  const expiryDate = new Date(d.getTime() + 540 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const isExpired = now > expiryDate
  const label = formatDateISO(expiryDate.toISOString())
  return { label, isExpired }
}

function PermitCards({
  permits,
  visibleCount,
  onShowMore,
}: {
  permits: PermitRow[]
  visibleCount: number
  onShowMore: () => void
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const visiblePermitsList = permits.slice(0, visibleCount)
  const hasMore = permits.length > visibleCount

  const toggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <>
      {visiblePermitsList.map((p, i) => {
        const key = p.permit_number ?? `permit-${i}`
        const isOpen = expandedKeys.has(key)
        const statusClass = permitStatusClass(p.permit_status)
        const workDesc = (p.work_description ?? '').trim()
        const workDescPreview = workDesc.length > 80 ? `${workDesc.slice(0, 77)}…` : workDesc
        const expiry = computePermitExpiry(p.issue_date)

        return (
          <div key={key} className="complaint" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
            <button
              type="button"
              onClick={() => toggle(key)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="complaint-type-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {isOpen ? '▼' : '▶'}
                  </span>
                  {p.permit_type ?? '—'}
                </div>
                {!isOpen && workDescPreview && (
                  <div style={{ marginTop: 3, marginLeft: 17, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    {workDescPreview}
                  </div>
                )}
                <div className="complaint-dates" style={{ marginTop: 6, marginLeft: 17 }}>
                  {p.issue_date != null && (
                    <span>Issued: <strong>{formatDateShort(p.issue_date)}</strong></span>
                  )}
                  {expiry && (
                    <span style={{ color: expiry.isExpired ? 'var(--red)' : undefined }}>
                      {expiry.isExpired ? 'Expired' : 'Expires'}: <strong>{expiry.label}</strong>
                    </span>
                  )}
                </div>
                {(p.reported_cost || p.total_fee) && (
                  <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4, marginLeft: 17, display: 'flex', gap: 12 }}>
                    {p.reported_cost && Number(p.reported_cost) > 0 && (
                      <span>Cost: <strong>${Number(p.reported_cost).toLocaleString()}</strong></span>
                    )}
                    {p.total_fee && Number(p.total_fee) > 0 && (
                      <span>Fee: <strong>${Number(p.total_fee).toLocaleString()}</strong></span>
                    )}
                  </div>
                )}
                <div className="complaint-sr" style={{ marginLeft: 17 }}>
                  {p.permit_number ? `#${p.permit_number}` : '—'}
                </div>
              </div>
              <div className={`status-badge status-badge-permit-${statusClass}`} style={{ flexShrink: 0, marginTop: 2 }}>
                {p.permit_status ?? '—'}
              </div>
            </button>

            {isOpen && (
              <div style={{
                borderTop: '1px solid var(--border, #e5e5e0)',
                padding: '10px 16px 12px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                textAlign: 'left',
              }}>
                {workDesc && (
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text)' }}>
                    {workDesc}
                  </div>
                )}
                {p.contact_1_name && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {p.contact_1_type ?? 'Contact'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-mid)' }}>{p.contact_1_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {hasMore && (
        <div className="feed-more-wrap">
          <button
            type="button"
            className="feed-more-btn"
            onClick={onShowMore}
          >
            Show 5 more
          </button>
        </div>
      )}
      <div className="feed-nudge">
        Subscribe to be alerted the moment a permit is pulled at this address.
      </div>
    </>
  )
}

type PropertyFeedProps = {
  addressNormalized: string
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
  addressNormalized,
  complaints,
  complaintsOpenCount: _complaintsOpenCount,
  violations,
  violationsOpenCount,
  violationsCompliedCount,
  permits,
  propertyZip,
  currentSlug,
  serverTime,
}: PropertyFeedProps) {
  const { user, isLoaded } = useUser()
  const [isAdmin, setIsAdmin] = useState(false)
  const [enrichedBySr, setEnrichedBySr] = useState<Map<string, EnrichedComplaint>>(() => new Map())

  useEffect(() => {
    if (!isLoaded) return
    if (!user) {
      setIsAdmin(false)
      return
    }
    void fetch('/api/profile/role', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { role?: string | null }) => {
        if (d.role === 'admin') setIsAdmin(true)
        else setIsAdmin(false)
      })
      .catch(() => {
        setIsAdmin(false)
      })
  }, [isLoaded, user])
  const [activeTab, setActiveTab] = useState<'311' | 'violations' | 'permits'>('311')
  const [showAllSRCodes, setShowAllSRCodes] = useState(false)
  const [visible311, setVisible311] = useState(PAGE_SIZE)
  const [visibleViolations, setVisibleViolations] = useState(PAGE_SIZE)
  const [visiblePermits, setVisiblePermits] = useState(PAGE_SIZE)
  const [statSlot, setStatSlot] = useState<HTMLElement | null>(null)

  const badgeRef = useRef<HTMLSpanElement | null>(null)
  const buildingBtnRef = useRef<HTMLButtonElement | null>(null)
  const totalBtnRef = useRef<HTMLButtonElement | null>(null)
  const [pillWidth, setPillWidth] = useState(0)
  const [pillLeft, setPillLeft] = useState(0)

  const filteredComplaints = showAllSRCodes
    ? complaints
    : complaints.filter((c) => isDefaultVisible(c.sr_short_code ?? null))
  const buildingComplaintsCount = complaints.filter((c) =>
    isDefaultVisible(c.sr_short_code ?? null),
  ).length
  const filteredOpenCount = filteredComplaints.filter(
    (c) => (c.status ?? '').toUpperCase() === 'OPEN',
  ).length
  const visibleComplaints = filteredComplaints.slice(0, visible311)
  const hasMore311 = filteredComplaints.length > visible311
  const visibleViolationsList = violations.slice(0, visibleViolations)
  const hasMoreViolations = violations.length > visibleViolations

  const activeBtnRef = showAllSRCodes ? totalBtnRef : buildingBtnRef

  useEffect(() => {
    const el = document.getElementById('complaints-stat-slot')
    if (el) setStatSlot(el)
  }, [])

  useEffect(() => {
    if (!isLoaded || !isAdmin || !addressNormalized) return
    let cancelled = false
    void fetch(`/api/complaints/enriched?address=${encodeURIComponent(addressNormalized)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : Promise.resolve(null)))
      .then((rows: EnrichedComplaint[] | null) => {
        if (cancelled || !rows || !Array.isArray(rows)) return
        const m = new Map<string, EnrichedComplaint>()
        for (const row of rows) m.set(String(row.sr_number), row)
        setEnrichedBySr(m)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isLoaded, isAdmin, addressNormalized])

  useEffect(() => {
    const btn = activeBtnRef.current
    if (!btn) return
    setPillWidth(btn.offsetWidth)
    setPillLeft(btn.offsetLeft)
  }, [showAllSRCodes, buildingComplaintsCount])

  useEffect(() => {
    const el = badgeRef.current
    if (!el) return
    el.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.15)' },
        { transform: 'scale(1)' },
      ],
      { duration: 200, easing: 'ease-in-out' },
    )
  }, [filteredComplaints.length])

  return (
    <>
      {statSlot && createPortal(
        <>
          <div className="stat-label">Complaints</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4, gap: 1 }}>
            <span className="stat-val stat-val-muted" style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
              <span style={{ color: filteredOpenCount > 0 ? 'var(--red)' : 'var(--text)' }}>{filteredOpenCount}</span>
              <span style={{ fontWeight: 400 }}>open</span>
            </span>
            <div className="stat-fraction" style={{ textAlign: 'center' }}>
              {filteredComplaints.length} total
            </div>
          </div>
        </>,
        statSlot,
      )}
      <div className="feed">
      <div className="tabs-bar">
        <button
          type="button"
          className={`tab ${activeTab === '311' ? 'active' : ''}`}
          onClick={() => setActiveTab('311')}
        >
          311 Complaints{' '}
          <span
            ref={badgeRef}
            className="tab-pill"
            style={{ display: 'inline-block', transformOrigin: 'center' }}
          >
            {filteredComplaints.length}
          </span>
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
          <div className="feed-meta-bar" style={{ padding: '9px 16px' }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                background: 'var(--cream-dark)',
                borderRadius: 6,
                height: 28,
                alignItems: 'center',
                padding: 0,
                minWidth: 'fit-content',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 0,
                  width: pillWidth,
                  height: 24,
                  lineHeight: '24px',
                  transform: `translateX(${pillLeft}px)`,
                  transition:
                    'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), width 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  background: '#fef3c7',
                  border: '0.5px solid #d97706',
                  borderRadius: 4,
                  boxSizing: 'border-box',
                }}
              />

              <button
                type="button"
                onClick={() => {
                  setShowAllSRCodes(false)
                  setVisible311(PAGE_SIZE)
                }}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  fontWeight: showAllSRCodes ? 400 : 500,
                  transition: 'color 150ms ease',
                  color: showAllSRCodes ? 'var(--text-dim)' : '#92400e',
                  padding: '2px 10px',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box',
                }}
                ref={buildingBtnRef}
              >
                {buildingComplaintsCount} Building
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAllSRCodes(true)
                  setVisible311(PAGE_SIZE)
                }}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  fontWeight: showAllSRCodes ? 500 : 400,
                  transition: 'color 150ms ease',
                  color: showAllSRCodes ? '#92400e' : 'var(--text-dim)',
                  padding: '2px 10px',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box',
                }}
                ref={totalBtnRef}
              >
                {complaints.length} Total
              </button>
            </div>
            <span className="feed-window-note">All time</span>
          </div>

          {complaints.length === 0 ? (
            <div className="empty-state">
              No 311 complaints on record for this address.
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="empty-state">
              No complaints match the current filter. Try &quot;Total&quot; to see every type.
            </div>
          ) : (
            <>
              {visibleComplaints.map((c) => {
                const statusClass = isOpen(c.status) ? 'open' : 'completed'
                const enrich = isAdmin && isLoaded ? enrichedBySr.get(String(c.sr_number)) : undefined

                if (enrich) {
                  return (
                    <div
                      key={c.sr_number}
                      className="complaint"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: 0,
                        gap: 0,
                        alignItems: 'stretch',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 12,
                          alignItems: 'start',
                          width: '100%',
                          padding: '14px 16px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div>
                          <div className="complaint-type-name">{c.sr_type ?? '—'}</div>
                          <div className="complaint-dept">
                            {[c.owner_department, c.origin].filter(Boolean).join(' · ')}
                          </div>
                          <div className="complaint-dates">
                            <span>
                              Filed: <strong>{formatDate(c.created_date)}</strong>
                            </span>
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
                      <ComplaintEnrichmentBlock data={enrich} />
                    </div>
                  )
                }

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
          <div className="feed-meta-bar" style={{ padding: '11px 16px' }}>
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
            <ViolationGroups
              violations={violations}
              visibleCount={visibleViolations}
              onShowMore={() => setVisibleViolations((n) => n + PAGE_SIZE)}
            />
          )}
        </div>
      </div>

      {/* Permits panel */}
      <div className={`tab-panel ${activeTab === 'permits' ? 'active' : ''}`} id="panel-permits">
        <div className="feed-body">
          <div className="feed-meta-bar" style={{ padding: '11px 16px' }}>
            <span className="feed-count"><strong>{permits.length}</strong> permits on record</span>
            <span className="feed-window-note">All time</span>
          </div>

          {permits.length === 0 ? (
            <div className="empty-state">
              No building permits found for this address.<br />
              Permit data is updated weekly.
            </div>
          ) : (
            <PermitCards
              permits={permits}
              visibleCount={visiblePermits}
              onShowMore={() => setVisiblePermits((n) => n + PAGE_SIZE)}
            />
          )}
        </div>
      </div>
    </div>
    </>
  )
}
