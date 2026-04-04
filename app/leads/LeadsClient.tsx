'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { CHICAGO_COMMUNITY_AREAS, getCommunityAreaName } from '@/lib/chicago-community-areas'

const TRADE_CATEGORIES: Record<string, { label: string; codes: string[] }> = {
  plumbing: {
    label: 'Plumbing & Water',
    codes: ['BBC', 'AAF', 'WBJ', 'WBK', 'WCA'],
  },
  pest: {
    label: 'Pest Control',
    codes: ['SGA', 'SGG', 'EAB', 'EBD'],
  },
  building: {
    label: 'Building & Code',
    codes: ['BBA', 'BBD', 'SCB', 'BPI', 'BBK', 'FAC', 'HDF', 'NAC'],
  },
}

const ALL_TRADE_CODES = Object.values(TRADE_CATEGORIES).flatMap((c) => c.codes)

const NEIGHBORHOOD_OPTIONS = Object.entries(CHICAGO_COMMUNITY_AREAS)
  .map(([num, name]) => ({ num, name }))
  .sort((a, b) => a.name.localeCompare(b.name))

const ALL_NEIGHBORHOOD_NUMS = NEIGHBORHOOD_OPTIONS.map((o) => o.num)
const NEIGHBORHOOD_COUNT = ALL_NEIGHBORHOOD_NUMS.length

const PAGE_SIZE = 25

export type LeadRow = {
  sr_number: string
  sr_type?: string | null
  sr_short_code?: string | null
  address_normalized?: string | null
  community_area?: string | null
  ward?: string | null
  created_date?: string | null
  status?: string | null
  street_name?: string
  /** Unlocked view */
  pin?: string | null
  owner_name?: string | null
  owner_phone?: string | null
  owner_address?: string | null
}

function deriveStreetName(addr: string | null | undefined): string {
  if (!addr) return '—'
  const parts = addr.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return addr
  return parts.slice(1).join(' ')
}

function normalizeLead(r: Record<string, unknown>): LeadRow {
  const addr = String(r.address_normalized ?? '')
  return {
    sr_number: String(r.sr_number ?? ''),
    sr_type: (r.sr_type as string) ?? null,
    sr_short_code: (r.sr_short_code as string) ?? null,
    address_normalized: addr || null,
    community_area: (r.community_area as string) ?? null,
    ward: (r.ward as string) ?? null,
    created_date: (r.created_date as string) ?? null,
    status: (r.status as string) ?? null,
    street_name: (r.street_name as string) || deriveStreetName(addr),
    pin: (r.pin as string) ?? null,
    owner_name: (r.owner_name as string) ?? null,
    owner_phone: (r.owner_phone as string) ?? null,
    owner_address: (r.owner_address as string) ?? null,
  }
}

function freshnessClass(n: number): string {
  if (n <= 0) return 'leads-freshness-green'
  if (n <= 2) return 'leads-freshness-amber'
  return 'leads-freshness-red'
}

/** Socrata stores Chicago local time with false +00:00 — slice so Date parses as local components. */
function formatLeadDate(rawDate: string | null | undefined): { date: string; time: string } {
  if (!rawDate) return { date: '—', time: '' }
  const local = rawDate.slice(0, 19)
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' }

  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  const hour = d.getHours()
  const minute = d.getMinutes().toString().padStart(2, '0')
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12

  return { date: `${month} ${day}`, time: `${h12}:${minute} ${ampm}` }
}

function parseLeadDateLocal(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw.slice(0, 19))
  return Number.isNaN(d.getTime()) ? null : d
}

function slugifyAddress(addr: string | null | undefined): string {
  if (!addr?.trim()) return 'property'
  return (
    addr
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'property'
  )
}

function maskedStreetLine(addr: string | null | undefined): string {
  if (!addr?.trim()) return '—'
  const parts = addr.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return `?? ${addr.trim()}`
  return `?? ${parts.slice(1).join(' ')}`
}

const MOCK_UNLOCK_OWNER = 'Jim McMahon'
const MOCK_UNLOCK_PHONE = '555-545-5595'

function NeighborhoodFilter({
  neighborhoodOptions,
  neighborhoods,
  onChange,
}: {
  neighborhoodOptions: { num: string; name: string }[]
  neighborhoods: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const allNums = neighborhoodOptions.map((o) => o.num)
  const activeFilter = neighborhoods.length > 0 && neighborhoods.length < NEIGHBORHOOD_COUNT

  const toggleAll = () => {
    if (neighborhoods.length === 0) onChange([...allNums])
    else onChange([])
  }

  const toggleOne = (n: string) => {
    if (neighborhoods.includes(n)) onChange(neighborhoods.filter((x) => x !== n))
    else onChange([...neighborhoods, n])
  }

  const label = !activeFilter
    ? 'All Neighborhoods'
    : `${neighborhoods.length} Neighborhood${neighborhoods.length === 1 ? '' : 's'}`

  return (
    <div className="leads-nb-wrap" ref={ref}>
      <button type="button" className="leads-nb-btn leads-select" onClick={() => setOpen((o) => !o)}>
        <span className="leads-nb-pin" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21s-8-4.5-8-11a8 8 0 1116 0c0 6.5-8 11-8 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        {label}
        {activeFilter && <span className="leads-nb-badge">{neighborhoods.length}</span>}
      </button>
      {open && (
        <div className="leads-nb-dropdown">
          <label className="leads-nb-item leads-nb-item-all">
            <input
              type="checkbox"
              checked={!activeFilter}
              ref={(el) => {
                if (el) el.indeterminate = activeFilter
              }}
              onChange={toggleAll}
            />
            <span>All neighborhoods</span>
          </label>
          <div className="leads-nb-list">
            {neighborhoodOptions.map(({ num, name }) => (
              <label key={num} className="leads-nb-item">
                <input type="checkbox" checked={neighborhoods.includes(num)} onChange={() => toggleOne(num)} />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LeadsClient() {
  const { isSignedIn, isLoaded } = useUser()
  const [view, setView] = useState<'public' | 'watchlist' | 'unlocked'>('public')
  const [category, setCategory] = useState<string>('all')
  const [neighborhoods, setNeighborhoods] = useState<string[]>([])
  const [timeWindow, setTimeWindow] = useState<number>(14)
  const [page, setPage] = useState(1)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [addressCounts, setAddressCounts] = useState<
    Record<string, { complaints: number; violations: number; permits: number }>
  >({})
  const [unlockCounts, setUnlockCounts] = useState<Record<string, number>>({})
  const [selectedSrNumbers, setSelectedSrNumbers] = useState<Set<string>>(new Set())
  const [watchlistSrNumbers, setWatchlistSrNumbers] = useState<Set<string>>(new Set())
  const [watchlistRows, setWatchlistRows] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [unlockedSrNumbers, setUnlockedSrNumbers] = useState<Set<string>>(() => new Set())
  const [unlockedLeadsList, setUnlockedLeadsList] = useState<LeadRow[]>([])

  const codesForCategory = useMemo(() => {
    if (category === 'all') return ALL_TRADE_CODES
    return TRADE_CATEGORIES[category]?.codes ?? ALL_TRADE_CODES
  }, [category])

  const codesSet = useMemo(() => new Set(codesForCategory), [codesForCategory])

  const filterLeadByFilters = useCallback(
    (row: LeadRow) => {
      if (row.sr_short_code && !codesSet.has(row.sr_short_code)) return false
      if (
        neighborhoods.length > 0 &&
        neighborhoods.length < NEIGHBORHOOD_COUNT
      ) {
        const ca = row.community_area != null ? String(row.community_area) : ''
        if (!neighborhoods.includes(ca)) return false
      }
      if (timeWindow && row.created_date) {
        const d = parseLeadDateLocal(row.created_date)
        if (!d) return false
        const since = new Date()
        since.setDate(since.getDate() - timeWindow)
        if (d < since) return false
      }
      return true
    },
    [codesSet, neighborhoods, timeWindow]
  )

  const refetchWatchlist = useCallback(async () => {
    if (!isSignedIn) {
      setWatchlistRows([])
      setWatchlistSrNumbers(new Set())
      return
    }
    const res = await fetch('/api/leads/watchlist')
    if (!res.ok) return
    const json = (await res.json()) as { watchlist?: Record<string, unknown>[] }
    const rows = (json.watchlist ?? []).map((w) =>
      normalizeLead({
        ...w,
        created_date: (w.created_date as string) ?? null,
        address_normalized: w.address_normalized,
      })
    )
    setWatchlistRows(rows)
    setWatchlistSrNumbers(new Set(rows.map((r) => r.sr_number)))
  }, [isSignedIn])

  useEffect(() => {
    if (!isLoaded) return
    refetchWatchlist()
  }, [isLoaded, isSignedIn, refetchWatchlist])

  const enrichCounts = useCallback(async (pageLeads: LeadRow[]) => {
    const addrs = [...new Set(pageLeads.map((l) => l.address_normalized).filter(Boolean) as string[])]
    const srs = pageLeads.map((l) => l.sr_number).filter(Boolean)
    if (addrs.length > 0) {
      const acRes = await fetch('/api/leads/address-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: addrs }),
      })
      const acJson = (await acRes.json()) as {
        counts?: Record<string, { complaints: number; violations: number; permits: number }>
      }
      if (acJson.counts) setAddressCounts((prev) => ({ ...prev, ...acJson.counts }))
    }
    if (srs.length > 0) {
      const ucRes = await fetch('/api/leads/unlock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sr_numbers: srs }),
      })
      const ucJson = (await ucRes.json()) as { counts?: Record<string, number> }
      if (ucJson.counts) setUnlockCounts((prev) => ({ ...prev, ...ucJson.counts }))
    }
  }, [])

  useEffect(() => {
    if (view !== 'public') return

    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/leads/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codes: codesForCategory,
            days: timeWindow,
            neighborhoods:
              neighborhoods.length > 0 && neighborhoods.length < NEIGHBORHOOD_COUNT
                ? neighborhoods
                : undefined,
            page,
            pageSize: PAGE_SIZE,
          }),
        })
        const json = (await res.json()) as { leads?: Record<string, unknown>[]; total?: number; error?: string }
        if (cancelled) return
        if (json.error) {
          setLeads([])
          setTotal(0)
          return
        }
        const next = (json.leads ?? []).map((r) => normalizeLead(r))
        setLeads(next)
        setTotal(json.total ?? 0)
        await enrichCounts(next)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [view, category, neighborhoods, timeWindow, page, codesForCategory, enrichCounts])

  useEffect(() => {
    if (view !== 'watchlist') return
    if (!isSignedIn) {
      setLeads([])
      setTotal(0)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const filtered = watchlistRows.filter(filterLeadByFilters)
    const from = (page - 1) * PAGE_SIZE
    const slice = filtered.slice(from, from + PAGE_SIZE)
    setLeads(slice)
    setTotal(filtered.length)
    void enrichCounts(slice).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [view, watchlistRows, isSignedIn, category, neighborhoods, timeWindow, page, filterLeadByFilters, enrichCounts])

  useEffect(() => {
    if (view === 'unlocked') {
      setSelectedSrNumbers(new Set())
    }
  }, [view])

  const onFilterChange = useCallback(() => {
    setPage(1)
    setSelectedSrNumbers(new Set())
  }, [])

  const toggleRow = (sr: string) => {
    setSelectedSrNumbers((prev) => {
      const next = new Set(prev)
      if (next.has(sr)) next.delete(sr)
      else next.add(sr)
      return next
    })
  }

  const selectAllOnPage = () => {
    if (leads.every((l) => selectedSrNumbers.has(l.sr_number))) {
      setSelectedSrNumbers(new Set())
      return
    }
    setSelectedSrNumbers(new Set(leads.map((l) => l.sr_number)))
  }

  const addToWatchlist = async () => {
    if (!isSignedIn) {
      window.alert('Sign in to save leads to your watchlist.')
      return
    }
    const picked = leads.filter((l) => selectedSrNumbers.has(l.sr_number))
    if (picked.length === 0) return
    const res = await fetch('/api/leads/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: picked }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      window.alert((j as { error?: string }).error || 'Could not save watchlist')
      return
    }
    await refetchWatchlist()
    setSelectedSrNumbers(new Set())
  }

  const removeFromWatchlist = async () => {
    if (!isSignedIn) return
    const srs = [...selectedSrNumbers]
    if (srs.length === 0) return
    const res = await fetch('/api/leads/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sr_numbers: srs }),
    })
    if (!res.ok) return
    await refetchWatchlist()
    setSelectedSrNumbers(new Set())
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const toIdx = Math.min(page * PAGE_SIZE, total)

  const handleViewChange = (v: 'public' | 'watchlist' | 'unlocked') => {
    setView(v)
    setPage(1)
    setSelectedSrNumbers(new Set())
  }

  const handleUnlock = async (lead: LeadRow) => {
    if (unlockedSrNumbers.has(lead.sr_number)) return
    setUnlockedSrNumbers((prev) => new Set([...prev, lead.sr_number]))
    setUnlockedLeadsList((prev) => (prev.some((l) => l.sr_number === lead.sr_number) ? prev : [...prev, lead]))
    setUnlockCounts((prev) => ({
      ...prev,
      [lead.sr_number]: (prev[lead.sr_number] ?? 0) + 1,
    }))
    if (isSignedIn) {
      const res = await fetch('/api/leads/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: [lead] }),
      })
      if (res.ok) await refetchWatchlist()
    }
  }

  return (
    <>
      <style>{`
        .leads-page { padding: 32px 40px; max-width: 1400px; margin: 0 auto; }
        .leads-title { font-family: Merriweather, Georgia, serif; font-size: 22px; font-weight: 600; color: #162d47; margin: 0 0 8px; }
        .leads-subtitle { font-size: 13px; color: #6b7280; margin: 0 0 24px; line-height: 1.45; }
        .leads-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
        .leads-select { font-size: 13px; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; color: #1a1a1a; min-height: 36px; }
        .toolbar-divider { width: 1px; height: 24px; background: #e5e7eb; }
        .leads-meta { font-size: 13px; color: #6b7280; }
        .leads-nb-wrap { position: relative; }
        .leads-nb-btn { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
        .leads-nb-pin { display: flex; color: #162d47; opacity: 0.85; }
        .leads-nb-badge { background: #162d47; color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 10px; }
        .leads-nb-dropdown { position: absolute; top: 100%; left: 0; margin-top: 6px; min-width: 280px; max-height: 320px; overflow: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.08); z-index: 50; }
        .leads-nb-list { max-height: 260px; overflow-y: auto; }
        .leads-nb-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; cursor: pointer; }
        .leads-nb-item:hover { background: #f9fafb; }
        .leads-nb-item-all { font-weight: 600; border-bottom: 1px solid #f3f4f6; }
        .watchlist-bar { display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: #f0faf2; border: 1px solid #c5e6c8; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .watchlist-bar button:first-of-type { background: #2d7a3a; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .watchlist-bar button:last-of-type { background: transparent; border: 0; font-size: 18px; cursor: pointer; color: #374151; line-height: 1; }
        .leads-table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
        .leads-table-scroll { max-height: calc(100vh - 200px); overflow-y: auto; }
        .leads-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .leads-table thead th {
          position: sticky;
          top: 0;
          z-index: 5;
          font-family: var(--font-dm-sans, 'DM Sans', system-ui, sans-serif);
          font-size: 13px;
          font-weight: 600;
          padding: 10px 10px;
          text-align: left;
          border-bottom: 1px solid rgba(255,255,255,.12);
          color: #e5e7eb;
          background: #0f2744;
        }
        .leads-table thead th.record-col {
          text-align: center;
          font-family: var(--mono, ui-monospace, monospace);
          color: rgba(255,255,255,0.55);
          background: #162d47;
        }
        .leads-table thead th.record-col-first {
          border-left: 1px solid rgba(255,255,255,0.1);
        }
        .leads-table thead th.leads-col-cb { text-align: center; }
        .col-sub-record {
          display: block;
          font-size: 9px;
          font-weight: 400;
          color: rgba(255,255,255,0.3);
          margin-top: 1px;
        }
        .leads-table tbody td:nth-child(2) {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .leads-col-sub { display: block; font-size: 10px; font-weight: 500; opacity: 0.85; margin-top: 2px; }
        .leads-th-center { text-align: center; }
        .leads-th-sub { display: block; font-size: 10px; font-weight: 500; opacity: 0.85; margin-top: 2px; }
        .leads-table .street { font-weight: 600; color: #162d47; display: block; }
        .leads-table .hood { font-size: 12px; color: #9ca3af; display: block; margin-top: 2px; }
        td.record-col {
          text-align: center;
          font-family: var(--mono, ui-monospace, monospace);
          font-size: 13px;
          color: #8a94a0;
          background: rgba(240, 242, 245, 0.35);
        }
        td.record-col-first {
          border-left: 1px solid #e5e2dc;
        }
        .leads-table tbody td { padding: 10px; vertical-align: middle; border-bottom: 1px solid #f3f4f6; }
        .leads-table tbody tr.leads-row-checked { background: #f7fbf8; }
        .leads-col-cb { width: 44px; text-align: center; }
        .leads-col-type { width: 160px; font-weight: 700; color: #162d47; }
        .leads-col-time { width: 90px; }
        .leads-time-date { display: block; color: #111827; }
        .leads-time-h { display: block; font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .leads-col-contact { width: 150px; }
        .leads-unlock-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; background: #f0eeea; border: 1px solid #e7e2db; border-radius: 6px; font-size: 12px; color: #374151; cursor: pointer; font-weight: 500; }
        .leads-unlock-btn:hover { background: #e8e4de; }
        .leads-col-fresh { width: 90px; text-align: center; font-family: ui-monospace, monospace; font-weight: 700; }
        .leads-freshness-green { color: #15803d; }
        .leads-freshness-amber { color: #b45309; }
        .leads-freshness-red { color: #b91c1c; }
        .leads-col-stat { width: 80px; text-align: center; background: rgba(240, 242, 245, 0.35); }
        .leads-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #fafafa; border-top: 1px solid #e5e7eb; font-size: 13px; color: #4b5563; }
        .leads-page-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .leads-page-btns button { min-width: 36px; padding: 6px 10px; border: 1px solid #e5e7eb; background: #fff; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .leads-page-btns button:disabled { opacity: 0.5; cursor: not-allowed; }
        .leads-page-btns button.leads-pg-active { background: #162d47; color: #fff; border-color: #162d47; }
        .leads-empty { padding: 48px 24px; text-align: center; color: #6b7280; font-size: 14px; }
        .leads-cb { width: 18px; height: 18px; accent-color: #162d47; cursor: pointer; }
        @media (max-width: 768px) {
          .leads-page { padding: 56px 16px 24px; }
        }
      `}</style>

      <div className="leads-page">
        <h1 className="leads-title">311 Service Leads</h1>
        <p className="leads-subtitle">Recent complaints in Chicago. Unlock contact info to claim a lead.</p>

        <div className="leads-toolbar">
          <select
            className="leads-select"
            value={view}
            onChange={(e) => handleViewChange(e.target.value as 'public' | 'watchlist' | 'unlocked')}
          >
            <option value="public">Public Leads</option>
            <option value="watchlist">Watchlist ({watchlistSrNumbers.size})</option>
            <option value="unlocked">Unlocked Leads ({unlockedLeadsList.length})</option>
          </select>

          <div className="toolbar-divider" />

          <select
            className="leads-select"
            value={category}
            disabled={view === 'unlocked'}
            onChange={(e) => {
              setCategory(e.target.value)
              onFilterChange()
            }}
          >
            <option value="all">All Categories</option>
            {Object.entries(TRADE_CATEGORIES).map(([key, cat]) => (
              <option key={key} value={key}>
                {cat.label}
              </option>
            ))}
          </select>

          <NeighborhoodFilter
            neighborhoodOptions={NEIGHBORHOOD_OPTIONS}
            neighborhoods={neighborhoods}
            onChange={(n) => {
              setNeighborhoods(n)
              onFilterChange()
            }}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {view !== 'unlocked' && (
              <span className="leads-meta">{total.toLocaleString()} leads</span>
            )}
            <div className="toolbar-divider" />
            <select
              className="leads-select"
              value={timeWindow}
              disabled={view === 'unlocked'}
              onChange={(e) => {
                setTimeWindow(Number(e.target.value))
                onFilterChange()
              }}
            >
              <option value={1}>Last 24 Hours</option>
              <option value={3}>Last 3 Days</option>
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
            </select>
          </div>
        </div>

        {view !== 'unlocked' && selectedSrNumbers.size > 0 && (
          <div className="watchlist-bar">
            {view === 'watchlist' ? (
              <button type="button" onClick={() => void removeFromWatchlist()}>
                − Remove from Watchlist
              </button>
            ) : (
              <button type="button" onClick={() => void addToWatchlist()}>
                + Add to Watchlist
              </button>
            )}
            <span>{selectedSrNumbers.size} leads selected</span>
            <button type="button" aria-label="Clear selection" onClick={() => setSelectedSrNumbers(new Set())}>
              ×
            </button>
          </div>
        )}

        {view === 'unlocked' ? (
          <div className="leads-table-wrap">
            <div className="leads-table-scroll">
              <table className="leads-table" style={{ tableLayout: 'fixed' as const }}>
                <thead>
                  <tr>
                    <th>Complaint Type</th>
                    <th>Recorded</th>
                    <th>Address</th>
                    <th>Owner</th>
                    <th>Phone</th>
                    <th>Property Page</th>
                  </tr>
                </thead>
                <tbody>
                  {unlockedLeadsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="leads-empty">
                        No unlocked leads yet. Unlock a lead from the Public Leads view to see contact info here.
                      </td>
                    </tr>
                  ) : (
                    unlockedLeadsList.map((lead) => {
                      const rec = formatLeadDate(lead.created_date ?? undefined)
                      const slug = slugifyAddress(lead.address_normalized)
                      return (
                        <tr key={lead.sr_number}>
                          <td>
                            <span className="leads-type-pill">{lead.sr_type ?? '—'}</span>
                          </td>
                          <td className="leads-col-time">
                            <span className="leads-time-date">{rec.date}</span>
                            {rec.time ? <span className="leads-time-h">{rec.time}</span> : null}
                          </td>
                          <td>
                            <div className="street">{lead.address_normalized?.trim() || '—'}</div>
                          </td>
                          <td style={{ fontWeight: 500 }}>{MOCK_UNLOCK_OWNER}</td>
                          <td style={{ fontFamily: 'var(--mono, ui-monospace, monospace)', color: '#8a94a0' }}>
                            {MOCK_UNLOCK_PHONE}
                          </td>
                          <td>
                            <Link href={`/address/${slug}`} style={{ color: '#0f2744', textDecoration: 'underline', fontSize: 12 }}>
                              View Property →
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="leads-table-wrap">
            <div className="leads-table-scroll">
              <table className="leads-table" style={{ tableLayout: 'fixed' as const }}>
                <colgroup>
                  <col style={{ width: '44px' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="leads-col-cb" aria-label="Select all">
                      <input
                        type="checkbox"
                        className="leads-cb"
                        checked={leads.length > 0 && leads.every((l) => selectedSrNumbers.has(l.sr_number))}
                        ref={(el) => {
                          if (el)
                            el.indeterminate =
                              selectedSrNumbers.size > 0 && !leads.every((l) => selectedSrNumbers.has(l.sr_number))
                        }}
                        onChange={selectAllOnPage}
                      />
                    </th>
                    <th>Complaint Type</th>
                    <th>Recorded</th>
                    <th>Location</th>
                    <th>
                      Contact
                      <span className="leads-col-sub">Name, Address &amp; Phone #</span>
                    </th>
                    <th className="leads-th-center">
                      Freshness
                      <span className="leads-col-sub"># of Unlocks</span>
                    </th>
                    <th className="record-col record-col-first">
                      311
                      <span className="col-sub-record">complaints</span>
                    </th>
                    <th className="record-col">
                      Violations
                      <span className="col-sub-record">issued</span>
                    </th>
                    <th className="record-col">
                      Permits
                      <span className="col-sub-record">filed</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="leads-empty">
                        Loading…
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="leads-empty">
                        No leads match your filters.
                      </td>
                    </tr>
                  ) : (
                    leads.map((row) => {
                      const addr = row.address_normalized ?? ''
                      const ac = addr ? addressCounts[addr] : undefined
                      const unc = unlockCounts[row.sr_number] ?? 0
                      const rec = formatLeadDate(row.created_date ?? undefined)
                      const hood =
                        getCommunityAreaName(row.community_area) ||
                        (row.community_area != null ? `Area ${row.community_area}` : '—')
                      const checked = selectedSrNumbers.has(row.sr_number)
                      const isUnlocked = unlockedSrNumbers.has(row.sr_number)
                      const locLine = isUnlocked
                        ? row.address_normalized?.trim() || '—'
                        : maskedStreetLine(row.address_normalized)
                      return (
                        <tr key={row.sr_number} className={checked ? 'leads-row-checked' : undefined}>
                          <td className="leads-col-cb">
                            <input
                              type="checkbox"
                              className="leads-cb"
                              checked={checked}
                              onChange={() => toggleRow(row.sr_number)}
                            />
                          </td>
                          <td className="leads-col-type">{row.sr_type ?? '—'}</td>
                          <td className="leads-col-time">
                            <span className="leads-time-date">{rec.date}</span>
                            {rec.time ? <span className="leads-time-h">{rec.time}</span> : null}
                          </td>
                          <td>
                            <div className="street">{locLine}</div>
                            <div className="hood">{hood}</div>
                          </td>
                          <td className="leads-col-contact">
                            {isUnlocked ? (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: '#0f2744' }}>{MOCK_UNLOCK_OWNER}</div>
                                <div style={{ fontSize: 11, color: '#8a94a0', fontFamily: 'var(--mono, ui-monospace, monospace)' }}>
                                  {MOCK_UNLOCK_PHONE}
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="leads-unlock-btn"
                                onClick={() => void handleUnlock(row)}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 5 }}
                                >
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0110 0v4" />
                                </svg>
                                Unlock
                              </button>
                            )}
                          </td>
                          <td className={`leads-col-fresh ${freshnessClass(unc)}`}>{unc}</td>
                          <td className="record-col record-col-first">{ac?.complaints ?? '—'}</td>
                          <td className="record-col">{ac?.violations ?? '—'}</td>
                          <td className="record-col">{ac?.permits ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && leads.length > 0 && (
              <div className="leads-pagination">
                <span>
                  Showing {fromIdx.toLocaleString()}–{toIdx.toLocaleString()} of {total.toLocaleString()}
                </span>
                <div className="leads-page-btns">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(1)}>
                    First
                  </button>
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let num = i + 1
                    if (totalPages > 5 && page > 3) num = page - 2 + i
                    if (num > totalPages) return null
                    if (num < 1) return null
                    return (
                      <button
                        key={num}
                        type="button"
                        className={num === page ? 'leads-pg-active' : ''}
                        onClick={() => setPage(num)}
                      >
                        {num}
                      </button>
                    )
                  })}
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </button>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
