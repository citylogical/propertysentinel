'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import ComplaintDetail, { type ComplaintDetailRecord } from '../details/ComplaintDetail'
import ViolationDetail, { type ViolationDetailRecord } from '../details/ViolationDetail'
import PermitDetail, { type PermitDetailRecord } from '../details/PermitDetail'
import { StatusPill, type StatusKind } from '../details/_shared'
import DashboardEmptyState from '../DashboardEmptyState'

type Category = 'complaint' | 'violation' | 'permit'

type ActivityRow = {
  category: Category
  id: string
  date: string
  ingest_date: string | null
  open_date: string | null
  last_modified: string | null
  display_type: string
  status: 'open' | 'closed' | 'active' | 'expired' | null
  property_id: string
  property_address: string
  property_slug: string | null
  community_area: string | null
  complaint?: ComplaintDetailRecord
  violations?: ViolationDetailRecord[]
  permit?: PermitDetailRecord
}

type Props = {
  isAdmin?: boolean
  /** Feed API base URL. Defaults to the authenticated dashboard feed; the
   *  public demo page points this at /api/demo/activity?slug=… instead. */
  endpoint?: string
  /** Initial time-range filter. Dashboard keeps the snappy 1wk default; the
   *  public demo opens at 1mo so the feed lands with a fuller story. */
  defaultRange?: '12mo' | '6mo' | '3mo' | '1mo' | '1wk'
}

const PAGE_SIZE = 50

// Two distinct date formatters, because complaints_311 / violations store
// Chicago-local time WITHOUT a tz marker (Supabase appends +00:00, making it
// look UTC), while created_at is genuinely UTC. Converting the former with a
// timeZone option double-shifts it -6h — that was the original display bug.

// For TRUE UTC timestamps (created_at / ingest). Converts UTC → Central,
// shows date + time.
function formatIngestCT(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

// For Chicago-local-stored-as-fake-UTC timestamps (created_date,
// last_modified_date, closed_date, violation_last_modified_date). Slice to the
// first 19 chars (YYYY-MM-DDTHH:MM:SS), drop the bogus offset, and display the
// wall-clock value AS-IS — no tz conversion. Handles DATE-only values
// (violation_date / issue_date, length 10) by showing date with no time.
function formatLocalAsIs(dateStr: string | null): string {
  if (!dateStr) return '—'
  const s = String(dateStr)
  const dateOnly = s.length <= 10
  const sliced = s.slice(0, 19).replace('T', ' ')
  // Parse the sliced wall-clock string into parts manually so no tz logic runs.
  const m = sliced.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s(\d{2}):(\d{2}))?/)
  if (!m) return '—'
  const [, y, mo, dd, hh, mi] = m
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthLabel = months[parseInt(mo, 10) - 1] ?? mo
  const dayNum = parseInt(dd, 10)
  const base = `${monthLabel} ${dayNum}, ${y}`
  if (dateOnly || hh == null) return base
  let h = parseInt(hh, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${base} ${h}:${mi} ${ampm}`
}

// Compact M/D/YY for the mobile row. Uses open_date (fake-UTC wall clock) —
// slice and parse manually, no tz conversion (same rule as formatLocalAsIs).
function formatShortMobile(dateStr: string | null): string {
  if (!dateStr) return ''
  const m = String(dateStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const [, y, mo, dd] = m
  return `${parseInt(mo, 10)}/${parseInt(dd, 10)}/${y.slice(2)}`
}

function categoryLabel(cat: Category): string {
  return cat === 'violation' ? 'VIOL' : cat === 'permit' ? 'PERMIT' : '311'
}

function categoryColor(cat: Category): string {
  return cat === 'violation' ? '#c8102e' : cat === 'permit' ? '#166534' : '#1e3a5f'
}

function rowKey(row: ActivityRow): string {
  return `${row.category}:${row.id}`
}

function statusKindFor(row: ActivityRow): StatusKind | null {
  // Duplicate complaints take precedence over open/closed — the row's "status"
  // field still says Open because Socrata never closes coupled duplicates,
  // but for UX they're not real workflow rows.
  if (row.category === 'complaint') {
    const c = row.complaint as { duplicate?: boolean | null } | undefined
    if (c?.duplicate === true) return 'duplicate'
  }
  if (row.category === 'permit') return 'active' // detail panel computes precise expiry
  if (row.status === 'open') return 'open'
  if (row.status === 'closed') return 'closed'
  return null
}

export default function ActivityFeedClient({
  isAdmin = false,
  endpoint = '/api/dashboard/activity',
  defaultRange = '1wk',
}: Props) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasProperties, setHasProperties] = useState<boolean | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [range, setRange] = useState<'12mo' | '6mo' | '3mo' | '1mo' | '1wk'>(defaultRange)
  const [category, setCategory] = useState<'all' | '311' | 'violation' | 'permit'>('all')
  const [buildingFilter, setBuildingFilter] = useState<'all' | 'building' | 'other'>('building')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)

  // Three responsive tiers:
  //   mobile  (≤640): compact 3-col rows + modal detail, no filters
  //   narrow  (≤768): 4-col rows (open/address/category/status), no filters, side detail
  //   full    (>768): 7-col rows + filters + side detail
  useEffect(() => {
    const mqMobile = window.matchMedia('(max-width: 640px)')
    const mqNarrow = window.matchMedia('(max-width: 1024px)')
    const update = () => {
      setIsMobile(mqMobile.matches)
      setIsNarrow(mqNarrow.matches)
    }
    update()
    mqMobile.addEventListener('change', update)
    mqNarrow.addEventListener('change', update)
    return () => {
      mqMobile.removeEventListener('change', update)
      mqNarrow.removeEventListener('change', update)
    }
  }, [])

  // Debounce search input → committed query (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(searchInput.trim())
      setOffset(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      range,
      category,
      building_filter: buildingFilter,
      status: statusFilter,
    })
    if (searchDebounced) params.set('search', searchDebounced)

    fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${params.toString()}`)
      .then((r) => r.json())
      .then((data: { items?: ActivityRow[]; total?: number; error?: string; has_properties?: boolean }) => {
        if (data.error) {
          setError(data.error)
          setRows([])
          setTotal(0)
          setHasProperties(null)
        } else {
          setRows(data.items ?? [])
          setTotal(data.total ?? 0)
          setHasProperties(data.has_properties ?? true)
          // Detail is always a modal now — never auto-open on load. Selection
          // is cleared on each fetch; the user taps a row to open the modal.
          setSelectedKey((prev) => {
            const items = data.items ?? []
            if (prev && items.some((r) => rowKey(r) === prev)) return prev
            return null
          })
        }
      })
      .catch((e) => {
        setHasProperties(null)
        setError(String(e))
      })
      .finally(() => setLoading(false))
  }, [offset, range, category, buildingFilter, statusFilter, searchDebounced, endpoint])

  const selectedRow = rows.find((r) => rowKey(r) === selectedKey) ?? null

  const headerTitle = 'Activity Details'

  const panelPalette =
    selectedRow?.category === 'violation'
      ? { headerBg: '#fbeeee', headerText: '#7a1a26' }
      : selectedRow?.category === 'permit'
        ? { headerBg: '#eef5ee', headerText: '#166534' }
        : { headerBg: '#eef4fb', headerText: '#1e3a5f' }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  if (!loading && hasProperties === false) {
    return <DashboardEmptyState kind="no_properties" context="activity" />
  }

  return (
    <div style={{ padding: '20px 28px 60px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
            {loading
              ? 'Loading…'
              : `${total} events · ${range === '12mo' ? 'last 12 months' : range === '6mo' ? 'last 6 months' : range === '3mo' ? 'last 3 months' : range === '1mo' ? 'last 30 days' : 'last 7 days'}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalPages > 1 ? (
            <div style={{ fontSize: 12, color: '#8a94a0' }}>
              Page {currentPage} of {totalPages}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: '14px 16px',
            background: '#fce8e8',
            border: '1px solid rgba(168,32,32,0.2)',
            color: '#a82020',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Failed to load activity: {error}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ── List pane ─────────────────────────────────────────────── */}
        <div style={{
          background: '#fff',
          borderRadius: 'var(--card-radius)',
          boxShadow: 'var(--card-shadow)',
          minWidth: 0,
          overflow: 'hidden',
        }}>
          {/* Filter toolbar — full-width desktop only; hidden on narrow + mobile */}
          {!isNarrow ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '150px 150px minmax(0, 1.4fr) 70px minmax(0, 1.6fr) 150px 70px',
              gap: 12,
              padding: '10px 14px 8px',
              borderBottom: '1px solid #f0ede6',
              alignItems: 'center',
            }}
          >
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value as typeof range)
                setOffset(0)
              }}
              style={toolbarSelect}
              aria-label="Date range"
            >
              <option value="1wk">Last 7 days</option>
              <option value="1mo">Last 30 days</option>
              <option value="3mo">Last 3 months</option>
              <option value="6mo">Last 6 months</option>
              <option value="12mo">Last 12 months</option>
            </select>

            <div />

            <input
              type="search"
              placeholder="Search address…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: 12,
                border: '1px solid #d9d3c2',
                borderRadius: 4,
                background: '#fff',
                fontFamily: 'inherit',
                outline: 'none',
                width: '100%',
                minWidth: 0,
              }}
              aria-label="Search address"
            />

            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as typeof category)
                setOffset(0)
              }}
              style={toolbarSelect}
              aria-label="Category filter"
            >
              <option value="all">All</option>
              <option value="311">311</option>
              <option value="violation">Violation</option>
              <option value="permit">Permit</option>
            </select>

            <select
              value={buildingFilter}
              onChange={(e) => {
                setBuildingFilter(e.target.value as typeof buildingFilter)
                setOffset(0)
              }}
              disabled={category !== 'all' && category !== '311'}
              style={{
                ...toolbarSelect,
                opacity: category !== 'all' && category !== '311' ? 0.5 : 1,
                cursor: category !== 'all' && category !== '311' ? 'not-allowed' : 'pointer',
              }}
              aria-label="Building filter"
              title={category !== 'all' && category !== '311' ? 'Applies to 311 complaints only' : undefined}
            >
              <option value="building">Owner-related</option>
              <option value="other">Other</option>
              <option value="all">All</option>
            </select>

            <div />

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter)
                setOffset(0)
              }}
              style={{ ...toolbarSelect, textAlign: 'right' }}
              aria-label="Status filter"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          ) : null}

          {/* Column headers: mobile = none; narrow = 4-col; full = 7-col */}
          {isMobile ? null : isNarrow ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '130px minmax(0, 1fr) 64px 70px',
                gap: 12,
                padding: '8px 14px',
                borderBottom: '2px solid #e5e1d6',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: '#999',
                textTransform: 'uppercase',
              }}
            >
              <span>Open Date</span>
              <span>Address</span>
              <span>Category</span>
              <span style={{ textAlign: 'right' }}>Status</span>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '150px 150px minmax(0, 1.4fr) 70px minmax(0, 1.6fr) 150px 70px',
                gap: 12,
                padding: '8px 14px',
                borderBottom: '2px solid #e5e1d6',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: '#999',
                textTransform: 'uppercase',
              }}
            >
              <span>Ingest Date</span>
              <span>Open Date</span>
              <span>Address</span>
              <span>Category</span>
              <span>Type</span>
              <span>Last Modified</span>
              <span style={{ textAlign: 'right' }}>Status</span>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8a94a0', fontSize: 13 }}>
              Loading activity…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#8a94a0', fontSize: 13 }}>
              No activity in the {range === '12mo' ? 'last 12 months' : range === '6mo' ? 'last 6 months' : range === '3mo' ? 'last 3 months' : range === '1mo' ? 'last 30 days' : 'last 7 days'} across your portfolio.
            </div>
          ) : (
            rows.map((row, idx) => {
              const key = rowKey(row)
              const isSelected = key === selectedKey
              const sk = statusKindFor(row)
              // ?building=true bypasses the BuildingDetectionModal on arrival.
              // The address page handles the case where no approved user
              // building range exists for this address (renders single-address
              // view normally; the query param is a no-op).
              const propertyHref = row.property_slug
                ? `/address/${encodeURIComponent(row.property_slug)}?building=true`
                : null
              return (
                <div
                  key={key}
                  data-activity-row="true"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedKey(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedKey(key)
                      return
                    }
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      const delta = e.key === 'ArrowDown' ? 1 : -1
                      const nextIndex = Math.max(0, Math.min(rows.length - 1, idx + delta))
                      if (nextIndex === idx) return
                      setSelectedKey(rowKey(rows[nextIndex]))
                      const parent = e.currentTarget.parentElement
                      const allRows = parent?.querySelectorAll<HTMLDivElement>('[data-activity-row="true"]')
                      allRows?.[nextIndex]?.focus()
                    }
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile
                      ? '64px minmax(0, 1fr) auto'
                      : isNarrow
                        ? '130px minmax(0, 1fr) 64px 70px'
                        : '150px 150px minmax(0, 1.4fr) 70px minmax(0, 1.6fr) 150px 70px',
                    gap: isMobile ? 10 : 12,
                    padding: isMobile ? '12px 14px' : '10px 14px',
                    borderBottom: '1px solid #f0ede6',
                    borderLeft: isSelected ? '3px solid #1e3a5f' : '3px solid transparent',
                    background: isSelected ? '#faf8f3' : 'transparent',
                    fontSize: 13,
                    cursor: 'pointer',
                    outline: 'none',
                    alignItems: 'center',
                    transition: 'background 120ms ease, border-left-color 120ms ease',
                  }}
                  onFocus={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#f7f6f2'
                    }
                  }}
                  onBlur={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {isMobile ? (
                    <>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 11,
                          color: '#888',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatShortMobile(row.open_date)}
                      </span>
                      <span
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: '#1a1a1a',
                          fontWeight: 500,
                        }}
                      >
                        {row.property_address}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: categoryColor(row.category),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {categoryLabel(row.category)}
                      </span>
                    </>
                  ) : isNarrow ? (
                    <>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 11,
                          color: '#888',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatLocalAsIs(row.open_date)}
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {propertyHref ? (
                          <Link
                            href={propertyHref}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: '#1a1a1a', fontWeight: 500, textDecoration: 'none', borderBottom: '1px dotted #c4c0b4' }}
                          >
                            {row.property_address}
                          </Link>
                        ) : (
                          <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{row.property_address}</span>
                        )}
                        {row.community_area ? (
                          <span style={{ color: '#999', fontWeight: 400, marginLeft: 6, fontSize: 12 }}>{row.community_area}</span>
                        ) : null}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: categoryColor(row.category),
                        }}
                      >
                        {categoryLabel(row.category)}
                      </span>
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {sk ? <StatusPill kind={sk} /> : null}
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 11,
                          color: '#888',
                        }}
                      >
                        {formatIngestCT(row.ingest_date)}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 11,
                          color: '#888',
                        }}
                      >
                        {formatLocalAsIs(row.open_date)}
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {propertyHref ? (
                          <Link
                            href={propertyHref}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              color: '#1a1a1a',
                              fontWeight: 500,
                              textDecoration: 'none',
                              borderBottom: '1px dotted #c4c0b4',
                            }}
                          >
                            {row.property_address}
                          </Link>
                        ) : (
                          <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{row.property_address}</span>
                        )}
                        {row.community_area ? (
                          <span style={{ color: '#999', fontWeight: 400, marginLeft: 6, fontSize: 12 }}>
                            {row.community_area}
                          </span>
                        ) : null}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 10,
                          fontWeight: 500,
                          letterSpacing: '0.08em',
                          color: categoryColor(row.category),
                        }}
                      >
                        {categoryLabel(row.category)}
                      </span>
                      <span
                        style={{
                          color: '#1a1a1a',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.display_type}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 11,
                          color: '#888',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {(() => {
                          const lm = row.last_modified
                          const od = row.open_date
                          if (lm && od && String(lm).slice(0, 16) === String(od).slice(0, 16)) return '—'
                          return formatLocalAsIs(lm)
                        })()}
                      </span>
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {sk ? <StatusPill kind={sk} /> : null}
                      </span>
                    </>
                  )}
                </div>
              )
            })
          )}

          {/* Pagination */}
          {total > PAGE_SIZE ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderTop: '1px solid #e5e1d6',
                background: '#faf8f3',
              }}
            >
              <span style={{ fontSize: 12, color: '#8a94a0' }}>
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={!hasPrev || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 500,
                    background: '#fff',
                    color: hasPrev ? '#0f2744' : '#c4c0b4',
                    border: '1px solid #e5e1d6',
                    borderRadius: 3,
                    cursor: hasPrev && !loading ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={!hasNext || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 500,
                    background: '#fff',
                    color: hasNext ? '#0f2744' : '#c4c0b4',
                    border: '1px solid #e5e1d6',
                    borderRadius: 3,
                    cursor: hasNext && !loading ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          ) : null}
        </div>

      </div>

      {/* ── Detail modal (all screen sizes) ─────────────────────────── */}
      {selectedRow
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              onClick={() => setSelectedKey(null)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: 'rgba(20, 20, 20, 0.45)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: isMobile ? 'flex-end' : 'center',
                alignItems: isMobile ? 'stretch' : 'center',
                padding: isMobile ? 0 : 24,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#fff',
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  borderBottomLeftRadius: isMobile ? 0 : 14,
                  borderBottomRightRadius: isMobile ? 0 : 14,
                  maxHeight: '90vh',
                  width: isMobile ? 'auto' : 'min(560px, 100%)',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  padding: isMobile
                    ? '18px 18px calc(24px + env(safe-area-inset-bottom))'
                    : '24px 28px 28px',
                  position: 'relative',
                  boxShadow: isMobile ? 'none' : '0 12px 48px rgba(15, 23, 42, 0.2)',
                }}
              >
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSelectedKey(null)}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#f0ede6',
                    color: '#5a5044',
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ×
                </button>
                <div
                  style={{
                    fontFamily: 'Merriweather, Georgia, serif',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#1a1a1a',
                    lineHeight: 1.2,
                    marginBottom: 10,
                    paddingRight: 40,
                  }}
                >
                  {headerTitle}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: '#888',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ color: categoryColor(selectedRow.category), fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {selectedRow.category === 'complaint' ? '311 Complaint' : selectedRow.category === 'violation' ? 'Violation' : 'Permit'}
                  </span>
                  {selectedRow.open_date ? <span> · {formatLocalAsIs(selectedRow.open_date)}</span> : null}
                </div>
                <div style={{ borderTop: '1px solid #f0ede6', marginBottom: 12 }} />
                {selectedRow.category === 'complaint' && selectedRow.complaint ? (
                  <ComplaintDetail
                    complaint={selectedRow.complaint}
                    isAdmin={isAdmin}
                    address={(selectedRow.complaint as { address?: string | null }).address ?? null}
                    addressSlug={selectedRow.property_slug}
                  />
                ) : selectedRow.category === 'violation' && selectedRow.violations ? (
                  <ViolationDetail
                    violations={selectedRow.violations}
                    address={(selectedRow.violations[0] as { address?: string | null })?.address ?? null}
                    addressSlug={selectedRow.property_slug}
                  />
                ) : selectedRow.category === 'permit' && selectedRow.permit ? (
                  <PermitDetail
                    permit={selectedRow.permit}
                    address={(selectedRow.permit as { address?: string | null }).address ?? null}
                    addressSlug={selectedRow.property_slug}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: '#8a94a0', fontStyle: 'italic' }}>
                    No details available.
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

const toolbarSelect: CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid #d9d3c2',
  borderRadius: 4,
  background: '#fff',
  fontFamily: 'inherit',
  color: '#1a1a1a',
  cursor: 'pointer',
  outline: 'none',
  width: '100%',
  minWidth: 0,
}
