'use client'

import { useState, useRef, useEffect } from 'react'
import type { ComplaintRow } from '@/lib/supabase-search'

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

type PropertyFeedProps = {
  complaints: ComplaintRow[]
  complaintsOpenCount: number
}

export default function PropertyFeed({ complaints, complaintsOpenCount }: PropertyFeedProps) {
  const [activeTab, setActiveTab] = useState<'311' | 'violations' | 'permits'>('311')
  const [unlocked311, setUnlocked311] = useState(false)
  const [unlockedViolations, setUnlockedViolations] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const mostRecent = complaints[0]
  const mostRecentOpenAndRecent = mostRecent && isOpen(mostRecent.status) && isWithinDays(mostRecent.created_date, 30)
  const showLocked311 = mostRecentOpenAndRecent && !unlocked311

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        dropdownRef.current.classList.remove('open')
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

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
              {complaints.map((c, i) => {
                const isLocked = i === 0 && showLocked311
                const statusClass = isOpen(c.status) ? 'open' : 'completed'
                if (isLocked) {
                  return (
                    <div key={c.sr_number} className="complaint locked" id="locked-311">
                      <div className="complaint-inner">
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
                      <div className="unlock-overlay">
                        <div className="unlock-form">
                          <input
                            className="unlock-input"
                            type="email"
                            placeholder="Enter your email to unlock"
                            id="emailInput311"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const email = (e.target as HTMLInputElement).value.trim()
                                if (email && email.includes('@')) setUnlocked311(true)
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="unlock-submit"
                            onClick={() => {
                              const input = document.getElementById('emailInput311') as HTMLInputElement
                              if (input?.value?.trim()?.includes('@')) setUnlocked311(true)
                            }}
                          >
                            Unlock
                          </button>
                        </div>
                      </div>
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
              <div className="feed-nudge" id="nudge-311">
                {showLocked311 ? (
                  <>Enter your email above to see the full detail on the <strong>most recent open complaint</strong>.</>
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

      {/* Permits panel */}
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
