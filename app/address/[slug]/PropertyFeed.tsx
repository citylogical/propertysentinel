'use client'

import { useState, useEffect } from 'react'
import type { ComplaintRow, ViolationRow, PermitRow } from '@/lib/supabase-search'
import { createClient } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'
import { setPendingZipCookie, getPendingZipFromCookie, clearPendingZipCookie, upsertSubscriberOnSession } from '@/lib/subscriber'

const LOCK_DAYS = 60
const PAGE_SIZE = 5

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' AM', 'am').replace(' PM', 'pm')
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function isOpen(status: string | null): boolean {
  return (status ?? '').toUpperCase() === 'OPEN'
}

function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  return diff <= days
}

function isComplaintLocked(row: ComplaintRow): boolean {
  return isOpen(row.status) && isWithinDays(row.created_date, LOCK_DAYS)
}

function isViolationStatusOpen(status: string | null): boolean {
  return (status ?? '').toUpperCase() === 'OPEN'
}

function isViolationLocked(row: ViolationRow): boolean {
  return isViolationStatusOpen(row.violation_status) && isWithinDays(row.violation_date, LOCK_DAYS)
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
}

type UnlockStep = 'zip' | 'email' | 'sent' | null

export default function PropertyFeed({
  complaints,
  complaintsOpenCount,
  violations,
  violationsOpenCount,
  violationsCompliedCount,
  permits,
  propertyZip,
  currentSlug,
}: PropertyFeedProps) {
  const [activeTab, setActiveTab] = useState<'311' | 'violations' | 'permits'>('311')
  const [session, setSession] = useState<Session | null>(null)
  const [unlockStep311, setUnlockStep311] = useState<UnlockStep>('zip')
  const [unlockStepViolations, setUnlockStepViolations] = useState<UnlockStep>('zip')
  const [visible311, setVisible311] = useState(PAGE_SIZE)
  const [visibleViolations, setVisibleViolations] = useState(PAGE_SIZE)
  const [visiblePermits, setVisiblePermits] = useState(PAGE_SIZE)
  const [zipForUnlock311, setZipForUnlock311] = useState<string | null>(null)
  const [zipForUnlockViolations, setZipForUnlockViolations] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const zip = getPendingZipFromCookie()
    if (!zip) return
    upsertSubscriberOnSession(session, zip).then(() => {
      clearPendingZipCookie()
    })
  }, [session])

  const hasSession = !!session

  // First locked row index: only that row shows the unlock overlay; all locked rows are blurred
  const firstLocked311Index = complaints.findIndex(isComplaintLocked)
  const showUnlockOverlay311 = !hasSession && firstLocked311Index >= 0

  // Only the single most recent violation meeting OPEN + within 60 days is locked
  const firstLockedViolationIndex = violations.findIndex(isViolationLocked)
  const showUnlockOverlayViolations = !hasSession && firstLockedViolationIndex >= 0

  const visibleComplaints = complaints.slice(0, visible311)
  const hasMore311 = complaints.length > visible311
  const visibleViolationsList = violations.slice(0, visibleViolations)
  const hasMoreViolations = violations.length > visibleViolations
  const visiblePermitsList = permits.slice(0, visiblePermits)
  const hasMorePermits = permits.length > visiblePermits

  const handleZipSubmit311 = (e: React.FormEvent) => {
    e.preventDefault()
    const input = (e.currentTarget.querySelector('input[name="zip"]') as HTMLInputElement)?.value?.trim() ?? ''
    setZipForUnlock311(input)
    setUnlockStep311('email')
  }

  const handleZipSubmitViolations = (e: React.FormEvent) => {
    e.preventDefault()
    const input = (e.currentTarget.querySelector('input[name="zip-violations"]') as HTMLInputElement)?.value?.trim() ?? ''
    setZipForUnlockViolations(input)
    setUnlockStepViolations('email')
  }

  const handleEmailSubmit = async (e: React.FormEvent, panel: '311' | 'violations') => {
    e.preventDefault()
    const input = (e.currentTarget.querySelector('input[name="email"]') as HTMLInputElement)?.value?.trim()
    if (!input || !input.includes('@')) return
    const zip = panel === '311' ? zipForUnlock311 : zipForUnlockViolations
    if (zip) setPendingZipCookie(zip)
    const supabase = createClient()
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`
    console.log('[signInWithOtp] emailRedirectTo:', emailRedirectTo)
    const { error } = await supabase.auth.signInWithOtp({
      email: input,
      options: {
        shouldCreateUser: true,
        emailRedirectTo,
      },
    })
    if (!error) {
      if (panel === '311') setUnlockStep311('sent')
      else setUnlockStepViolations('sent')
    }
  }

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
              {visibleComplaints.map((c, i) => {
                const locked = !hasSession && isComplaintLocked(c)
                const showOverlay = locked && i === firstLocked311Index
                const statusClass = isOpen(c.status) ? 'open' : 'completed'

                if (locked) {
                  return (
                    <div key={c.sr_number} className="complaint locked" id="locked-311">
                      <div className="complaint-inner" style={{ filter: 'blur(4px)' }}>
                        <div>
                          <div className="complaint-type-name">{c.sr_type ?? '—'}</div>
                          <div className="complaint-dept">
                            {[c.owner_department, c.origin].filter(Boolean).join(' · ')}
                          </div>
                          <div className="complaint-dates">
                            <span>Filed: <strong>{formatDate(c.created_date)}</strong></span>
                          </div>
                          <div className="complaint-sr">#{c.sr_number}</div>
                        </div>
                        <div className={`status-badge ${statusClass}`}>Open</div>
                      </div>
                      {showOverlay && (
                      <div className="unlock-overlay">
                        {(unlockStep311 === 'zip' || unlockStep311 === null) && (
                          <form onSubmit={handleZipSubmit311} className="unlock-zip-wrap">
                            <label htmlFor="unlock-zip-311" className="unlock-label-block">
                              Enter your ZIP code to unlock
                            </label>
                            <div className="unlock-form">
                              <input
                                id="unlock-zip-311"
                                name="zip"
                                type="text"
                                inputMode="numeric"
                                maxLength={5}
                                placeholder="ZIP code"
                                className="unlock-input"
                                autoComplete="postal-code"
                              />
                              <button type="submit" className="unlock-submit">Unlock</button>
                            </div>
                          </form>
                        )}
                        {unlockStep311 === 'email' && (
                          <form onSubmit={(e) => handleEmailSubmit(e, '311')} className="unlock-zip-wrap">
                            <p className="unlock-label-block">Almost there — enter your email to see the full details.</p>
                            <div className="unlock-form">
                              <input name="email" type="email" placeholder="Email" className="unlock-input" required />
                              <button type="submit" className="unlock-submit">Submit</button>
                            </div>
                          </form>
                        )}
                        {unlockStep311 === 'sent' && (
                          <p className="unlock-sent">Check your inbox — click the link we sent to verify.</p>
                        )}
                      </div>
                      )}
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
                {!hasSession && firstLocked311Index >= 0 ? (
                  <>Enter your ZIP above to unlock recent open complaints, then verify your email.</>
                ) : (
                  'Subscribe to get alerted the moment a new complaint is filed at this address.'
                )}
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
                const isFirstLocked = i === firstLockedViolationIndex
                const locked = !hasSession && isFirstLocked && isViolationLocked(v)
                const showOverlay = locked
                const statusClass = violationStatusClass(v.violation_status)

                if (locked) {
                  return (
                    <div key={v.inspection_number ?? i} className="complaint locked" id="locked-violations">
                      <div className="complaint-inner" style={{ filter: 'blur(4px)' }}>
                        <div>
                          <div className="complaint-type-name">{v.violation_description ?? '—'}</div>
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
                            {!isViolationStatusOpen(v.violation_status) && v.violation_status?.toUpperCase() === 'COMPLIED' && v.violation_last_modified_date != null && (
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
                      {showOverlay && (
                      <div className="unlock-overlay">
                        {(unlockStepViolations === 'zip' || unlockStepViolations === null) && (
                          <form onSubmit={handleZipSubmitViolations} className="unlock-zip-wrap">
                            <label htmlFor="unlock-zip-violations" className="unlock-label-block">
                              Enter your ZIP code to unlock
                            </label>
                            <div className="unlock-form">
                              <input
                                id="unlock-zip-violations"
                                name="zip-violations"
                                type="text"
                                inputMode="numeric"
                                maxLength={5}
                                placeholder="ZIP code"
                                className="unlock-input"
                                autoComplete="postal-code"
                              />
                              <button type="submit" className="unlock-submit">Unlock</button>
                            </div>
                          </form>
                        )}
                        {unlockStepViolations === 'email' && (
                          <form onSubmit={(e) => handleEmailSubmit(e, 'violations')} className="unlock-zip-wrap">
                            <p className="unlock-label-block">Almost there — enter your email to see the full details.</p>
                            <div className="unlock-form">
                              <input name="email" type="email" placeholder="Email" className="unlock-input" required />
                              <button type="submit" className="unlock-submit">Submit</button>
                            </div>
                          </form>
                        )}
                        {unlockStepViolations === 'sent' && (
                          <p className="unlock-sent">Check your inbox — click the link we sent to verify.</p>
                        )}
                      </div>
                      )}
                    </div>
                  )
                }

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
                {!hasSession && firstLockedViolationIndex >= 0 ? (
                  <>Enter your ZIP above to unlock recent open violations, then verify your email.</>
                ) : (
                  'Subscribe to be alerted the moment a violation is issued at this address.'
                )}
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
