'use client'

import { useState, useRef, useEffect } from 'react'
import type { ComplaintRow } from '@/lib/supabase-search'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { Session } from '@supabase/supabase-js'

const LOCK_DAYS = 60
const PAGE_SIZE = 10

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

function isLocked(row: ComplaintRow): boolean {
  return isOpen(row.status) && isWithinDays(row.created_date, LOCK_DAYS)
}

type PropertyFeedProps = {
  complaints: ComplaintRow[]
  complaintsOpenCount: number
  propertyZip: string | null
  currentSlug: string
}

type UnlockStep = 'zip' | 'email' | 'sent' | null

export default function PropertyFeed({ complaints, complaintsOpenCount, propertyZip, currentSlug }: PropertyFeedProps) {
  const [activeTab, setActiveTab] = useState<'311' | 'violations' | 'permits'>('311')
  const [session, setSession] = useState<Session | null>(null)
  const [unlockStep311, setUnlockStep311] = useState<UnlockStep>('zip')
  const [zipError, setZipError] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [visible311, setVisible311] = useState(PAGE_SIZE)

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => subscription.unsubscribe()
  }, [])

  const locked311Indices = complaints
    .map((c, i) => (isLocked(c) ? i : -1))
    .filter((i) => i >= 0)
  const firstLocked311Index = locked311Indices[0] ?? -1
  const hasSession = !!session
  const showUnlockOverlay311 = !hasSession && firstLocked311Index >= 0

  const visibleComplaints = complaints.slice(0, visible311)
  const hasMore311 = complaints.length > visible311

  const handleZipSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = (e.currentTarget.querySelector('input[name="zip"]') as HTMLInputElement)?.value?.trim()
    const expected = (propertyZip ?? '').replace(/\D/g, '')
    const entered = (input ?? '').replace(/\D/g, '')
    if (entered.length === 5 && expected && entered === expected) {
      setZipError(false)
      setUnlockStep311('email')
    } else {
      setZipError(true)
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const input = (e.currentTarget.querySelector('input[name="email"]') as HTMLInputElement)?.value?.trim()
    if (!input || !input.includes('@')) return
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://propertysentinel.io'
    const next = `/address/${currentSlug}`
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email: input,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (!error) {
      setEmailSent(true)
      setUnlockStep311('sent')
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
          Violations <span className="tab-pill amber">0</span>
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'permits' ? 'active' : ''}`}
          onClick={() => setActiveTab('permits')}
        >
          Permits <span className="tab-pill">0</span>
        </button>
      </div>

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
                const locked = !hasSession && isLocked(c)
                const showOverlay = locked && i === firstLocked311Index && showUnlockOverlay311
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
                      {i === firstLocked311Index && (
                        <div className="unlock-overlay">
                          {(unlockStep311 === 'zip' || unlockStep311 === null) && (
                            <div className="unlock-form-wrapper">
                              <form onSubmit={handleZipSubmit} className="unlock-form unlock-form-stack">
                                <label htmlFor="unlock-zip-311" className="unlock-label">
                                  Enter your ZIP code to unlock
                                </label>
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
                                {zipError && (
                                  <p className="unlock-error">ZIP code doesn&apos;t match this property.</p>
                                )}
                                <button type="submit" className="unlock-submit">Unlock</button>
                              </form>
                            </div>
                          )}
                          {unlockStep311 === 'email' && (
                            <div className="unlock-form-wrapper">
                              <form onSubmit={handleEmailSubmit} className="unlock-form unlock-form-stack">
                                <p className="unlock-label">Almost there — enter your email to see the full details.</p>
                                <input
                                  name="email"
                                  type="email"
                                  placeholder="Email"
                                  className="unlock-input"
                                  required
                                />
                                <button type="submit" className="unlock-submit">Send verification link</button>
                              </form>
                            </div>
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
                    Show 10 more
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

      <div className={`tab-panel ${activeTab === 'violations' ? 'active' : ''}`} id="panel-violations">
        <div className="feed-body">
          <div className="feed-meta-bar">
            <span className="feed-count"><strong>0</strong> violations · <strong>0</strong> open</span>
            <span className="feed-window-note">All time</span>
          </div>
          <div className="empty-state">
            No building violations on record for this address.
          </div>
          <div className="feed-nudge">
            Subscribe to be alerted the moment a violation is issued at this address.
          </div>
        </div>
      </div>

      <div className={`tab-panel ${activeTab === 'permits' ? 'active' : ''}`} id="panel-permits">
        <div className="feed-body">
          <div className="feed-meta-bar">
            <span className="feed-count"><strong>0</strong> permits on record</span>
            <span className="feed-window-note">All time</span>
          </div>
          <div className="empty-state">
            No building permits found for this address.<br />
            Permit data is updated weekly.
          </div>
          <div className="feed-nudge">
            Subscribe to be alerted the moment a permit is pulled at this address.
          </div>
        </div>
      </div>
    </div>
  )
}
