'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import NearbyListingsModal from '@/components/NearbyListingsModal'
import AuditList from './AuditList'
import CreateAuditModal from './CreateAuditModal'
import PortfolioDetail from './PortfolioDetail'
import DashboardEmptyState from './DashboardEmptyState'
import type { PortfolioProperty } from './types'

type Props = {
  isAdmin?: boolean
}

type SortField =
  | 'address'
  | 'community_area'
  | 'units_total'
  | 'latest_building_complaint_date'
  | 'open_building_complaints'
  | 'total_building_complaints_12mo'
  | 'total_complaints_12mo'
  | 'total_violations_12mo'
  | 'total_permits'
  | 'nearby_listings'

type SortDir = 'asc' | 'desc'

const PAGE_SIZE_OPTIONS = [25, 50, 100]

function defaultSmartSort(a: PortfolioProperty, b: PortfolioProperty): number {
  const ao = a.open_building_complaints ?? 0
  const bo = b.open_building_complaints ?? 0
  if (bo !== ao) return bo - ao
  const ab = a.total_building_complaints_12mo ?? a.total_complaints_12mo ?? a.open_complaints ?? 0
  const bb = b.total_building_complaints_12mo ?? b.total_complaints_12mo ?? b.open_complaints ?? 0
  if (bb !== ab) return bb - ab
  const av = a.total_violations_12mo ?? 0
  const bv = b.total_violations_12mo ?? 0
  if (bv !== av) return bv - av
  const ap = a.total_permits ?? 0
  const bp = b.total_permits ?? 0
  if (bp !== ap) return bp - ap
  const al = a.nearby_listings ?? 0
  const bl = b.nearby_listings ?? 0
  return bl - al
}

function getSortKey(p: PortfolioProperty, field: SortField): number | string {
  switch (field) {
    case 'address':
      return (p.display_name || p.address_range || p.canonical_address || '').toLowerCase()
    case 'community_area':
      return (p.community_area ?? '').toLowerCase()
    case 'units_total':
      return p.units_total ?? 0
    case 'latest_building_complaint_date':
      // Sort by most recent first; null → -Infinity-ish so they go to the bottom
      return p.latest_building_complaint_date
        ? new Date(p.latest_building_complaint_date).getTime()
        : Number.NEGATIVE_INFINITY
    case 'open_building_complaints':
      return p.open_building_complaints ?? -1 // null below 0
    case 'total_building_complaints_12mo':
      return p.total_building_complaints_12mo ?? -1
    case 'total_complaints_12mo':
      return p.total_complaints_12mo ?? 0
    case 'total_violations_12mo':
      return p.total_violations_12mo ?? 0
    case 'total_permits':
      return p.total_permits ?? 0
    case 'nearby_listings':
      return p.nearby_listings ?? 0
    default:
      return 0
  }
}

function formatUnitsSummary(p: PortfolioProperty): string {
  const total = p.units_total ?? 0
  return total > 0 ? String(total) : '—'
}

function formatLatestDate(iso: string | null): { short: string; full: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = Date.now()
  const ageMs = now - d.getTime()
  const ageDays = Math.floor(ageMs / 86400000)
  const ageHours = Math.floor(ageMs / 3600000)
  const ageMin = Math.floor(ageMs / 60000)

  let short: string
  if (ageMs < 0) {
    short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } else if (ageMin < 60) {
    short = `${Math.max(1, ageMin)}m ago`
  } else if (ageHours < 24) {
    short = `${ageHours}h ago`
  } else if (ageDays < 7) {
    short = `${ageDays}d ago`
  } else {
    short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const full = d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return { short, full }
}

export default function PortfolioTable({ isAdmin = false }: Props) {
  const router = useRouter()
  const urlParams = useSearchParams()

  const [properties, setProperties] = useState<PortfolioProperty[]>([])
  const [ownerName, setOwnerName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAuditModal, setShowAuditModal] = useState(false)
  const [listingsProperty, setListingsProperty] = useState<PortfolioProperty | null>(null)
  const [listingsCoords, setListingsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [backfillJob, setBackfillJob] = useState<{
    job_id: string | null
    total: number
    processed: number
    failed: number
    status: 'pending' | 'running' | 'done' | 'idle' | 'error'
    message?: string
  } | null>(null)

  // ─── URL-synced state ─────────────────────────────────────────────────
  const searchQuery = urlParams.get('search') ?? ''
  const sortField = (urlParams.get('sort_field') as SortField | null) ?? null
  const sortDir = (urlParams.get('sort_dir') as SortDir | null) ?? 'desc'
  const filterTag = urlParams.get('filter_tag') ?? ''
  const filterStatus = urlParams.get('filter_status') ?? ''
  const pageSizeRaw = parseInt(urlParams.get('page_size') ?? '25', 10)
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw) ? pageSizeRaw : 25
  const pageRaw = parseInt(urlParams.get('page') ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1

  const setUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(urlParams.toString())
      for (const [key, val] of Object.entries(updates)) {
        if (val == null || val === '') {
          next.delete(key)
        } else {
          next.set(key, val)
        }
      }
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [router, urlParams]
  )

  // Reset page to 1 whenever filters/search/sort change. We do this by
  // intercepting the setters below and clearing `page` at the same time.

  const loadPortfolioList = useCallback(async () => {
    const listData = await fetch('/api/dashboard/list').then((r) => r.json())
    if (listData.error) {
      throw new Error(String(listData.error))
    }
    setProperties((listData.properties as PortfolioProperty[]) ?? [])
    setOwnerName(
      ((listData.subscriber as { organization?: string | null } | undefined)?.organization ?? null)
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loadPortfolioList()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadPortfolioList])

  useEffect(() => {
    if (!backfillJob || backfillJob.status !== 'running' || !backfillJob.job_id) return

    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/dashboard/backfill/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: backfillJob.job_id }),
        })
        const data = (await res.json()) as {
          job_id: string
          total: number
          processed: number
          failed: number
          status: 'running' | 'done'
          error?: string
        }
        if (cancelled) return
        if (data.error) {
          setBackfillJob((prev) => (prev ? { ...prev, status: 'error', message: data.error } : prev))
          return
        }
        if (data.status === 'done') {
          setBackfillJob({
            job_id: data.job_id,
            total: data.total,
            processed: data.processed,
            failed: data.failed,
            status: 'done',
          })
          await loadPortfolioList()
          globalThis.setTimeout(() => {
            if (!cancelled) setBackfillJob(null)
          }, 4000)
          return
        }
        setBackfillJob({
          job_id: data.job_id,
          total: data.total,
          processed: data.processed,
          failed: data.failed,
          status: 'running',
        })
      } catch (err) {
        if (cancelled) return
        setBackfillJob((prev) =>
          prev
            ? { ...prev, status: 'error', message: err instanceof Error ? err.message : 'Process failed' }
            : prev
        )
      }
    }

    void tick()
    return () => {
      cancelled = true
    }
  }, [backfillJob, loadPortfolioList])

  useEffect(() => {
    if (!listingsProperty) return

    let cancelled = false
    const pin = listingsProperty.pins?.[0]
    if (!pin) {
      const id = globalThis.setTimeout(() => {
        if (!cancelled) setListingsCoords(null)
      }, 0)
      return () => {
        cancelled = true
        globalThis.clearTimeout(id)
      }
    }

    fetch(`/api/parcel-coords?pin=${encodeURIComponent(pin)}`)
      .then((r) => r.json())
      .then((d: { lat?: number | null; lng?: number | null }) => {
        if (cancelled) return
        if (d.lat != null && d.lng != null && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
          setListingsCoords({ lat: d.lat, lng: d.lng })
        } else {
          setListingsCoords(null)
        }
      })
      .catch(() => {
        if (!cancelled) setListingsCoords(null)
      })
    return () => {
      cancelled = true
    }
  }, [listingsProperty])

  // ─── Discovery for filter dropdowns ───────────────────────────────────
  const [tagOptions, setTagOptions] = useState<{ name: string; count: number }[]>([])
  const [statusOptions, setStatusOptions] = useState<{ name: string; count: number }[]>([])

  useEffect(() => {
    fetch('/api/dashboard/units/tags')
      .then((r) => r.json())
      .then(
        (d: {
          tags?: { name: string; count: number }[]
          statuses?: { name: string; count: number }[]
        }) => {
          setTagOptions(d.tags ?? [])
          setStatusOptions(d.statuses ?? [])
        }
      )
      .catch(() => {
        /* dropdowns empty, no biggie */
      })
  }, [properties])

  // ─── Filter + sort + paginate ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return properties.filter((p) => {
      if (q) {
        const hay = `${p.display_name ?? ''} ${p.canonical_address ?? ''} ${p.address_range ?? ''} ${p.community_area ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterTag) {
        const tags = p.units_tag_breakdown ?? {}
        if (!Object.keys(tags).includes(filterTag)) return false
      }
      if (filterStatus) {
        const statuses = p.units_status_breakdown ?? {}
        if (!Object.keys(statuses).includes(filterStatus)) return false
      }
      return true
    })
  }, [properties, searchQuery, filterTag, filterStatus])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (!sortField) {
      arr.sort(defaultSmartSort)
      return arr
    }
    arr.sort((a, b) => {
      const ka = getSortKey(a, sortField)
      const kb = getSortKey(b, sortField)
      let cmp = 0
      if (typeof ka === 'number' && typeof kb === 'number') cmp = ka - kb
      else cmp = String(ka).localeCompare(String(kb))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const paginated = sorted.slice(pageStart, pageStart + pageSize)

  // Auto-correct invalid page in URL on snap
  useEffect(() => {
    if (page !== safePage) {
      setUrlParams({ page: String(safePage) })
    }
  }, [page, safePage, setUrlParams])

  // ─── Toolbar action handlers (all reset page=1) ───────────────────────
  const handleSearchChange = (val: string) => {
    setUrlParams({ search: val || null, page: '1' })
  }

  const handleFilterTagChange = (val: string) => {
    setUrlParams({ filter_tag: val || null, page: '1' })
  }

  const handleFilterStatusChange = (val: string) => {
    setUrlParams({ filter_status: val || null, page: '1' })
  }

  const handlePageSizeChange = (val: number) => {
    setUrlParams({ page_size: String(val), page: '1' })
  }

  const handleHeaderClick = (field: SortField) => {
    // toggle asc → desc → off
    if (sortField !== field) {
      setUrlParams({ sort_field: field, sort_dir: 'desc', page: '1' })
    } else if (sortDir === 'desc') {
      setUrlParams({ sort_dir: 'asc', page: '1' })
    } else {
      setUrlParams({ sort_field: null, sort_dir: null, page: '1' })
    }
  }

  const handlePageChange = (newPage: number) => {
    setUrlParams({ page: String(Math.max(1, Math.min(totalPages, newPage))) })
  }

  // ─── Selection ────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (paginated.every((p) => selectedIds.has(p.id)) && paginated.length > 0) {
      // Deselect all visible
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const p of paginated) next.delete(p.id)
        return next
      })
    } else {
      // Select all visible
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const p of paginated) next.add(p.id)
        return next
      })
    }
  }

  const handleStartBackfill = async () => {
    if (selectedIds.size === 0) return
    setBackfillJob({ job_id: null, total: 0, processed: 0, failed: 0, status: 'pending' })
    try {
      const res = await fetch('/api/dashboard/backfill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_ids: Array.from(selectedIds) }),
      })
      const data = (await res.json()) as {
        job_id: string | null
        total: number
        processed: number
        failed: number
        status: 'pending' | 'running' | 'done' | 'error'
        message?: string
        error?: string
      }
      if (data.error) {
        setBackfillJob({ job_id: null, total: 0, processed: 0, failed: 0, status: 'error', message: data.error })
        return
      }
      if (data.status === 'done' || data.total === 0) {
        setBackfillJob({
          job_id: null,
          total: data.total,
          processed: data.processed,
          failed: data.failed,
          status: 'done',
          message: data.message ?? 'No unenriched complaints found.',
        })
        globalThis.setTimeout(() => setBackfillJob(null), 3000)
        return
      }
      setBackfillJob({
        job_id: data.job_id,
        total: data.total,
        processed: data.processed,
        failed: data.failed,
        status: 'running',
      })
    } catch (err) {
      setBackfillJob({
        job_id: null,
        total: 0,
        processed: 0,
        failed: 0,
        status: 'error',
        message: err instanceof Error ? err.message : 'Backfill failed to start',
      })
    }
  }

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Remove ${selectedIds.size} properties from your portfolio?`)) return
    const idsToRemove = new Set(selectedIds)
    for (const id of idsToRemove) {
      const prop = properties.find((p) => p.id === id)
      if (prop) {
        await fetch('/api/dashboard/unsave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canonical_address: prop.canonical_address }),
        })
      }
    }
    setSelectedIds(new Set())
    if (selectedId && idsToRemove.has(selectedId)) setSelectedId(null)
    await loadPortfolioList()
  }

  const selectedProperty = properties.find((p) => p.id === selectedId) ?? null

  const getFlag = (p: PortfolioProperty): { label: string; color: 'red' | 'amber' } | null => {
    if (p.has_stop_work) return { label: 'Stop work', color: 'red' }
    const recent = (p as PortfolioProperty & { recent_complaints_30d?: number | null }).recent_complaints_30d ?? 0
    if (recent >= 3) return { label: `${recent} recent`, color: 'red' }
    if (recent > 0) return { label: `${recent} recent`, color: 'amber' }
    if (p.is_pbl) return { label: 'PBL', color: 'amber' }
    if (p.shvr_count > 0) return { label: `${p.shvr_count} SHVR`, color: 'amber' }
    return null
  }

  const handleDelete = async (e: MouseEvent, prop: PortfolioProperty) => {
    e.stopPropagation()
    if (!confirm(`Remove ${prop.display_name || prop.canonical_address} from your portfolio?`)) return
    try {
      const res = await fetch('/api/dashboard/unsave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical_address: prop.canonical_address }),
      })
      if (res.ok) {
        if (selectedId === prop.id) setSelectedId(null)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(prop.id)
          return next
        })
        await loadPortfolioList()
      }
    } catch (err) {
      console.error('Failed to remove property:', err)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          padding: '80px 28px',
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: 'var(--text-dim)',
        }}
      >
        Loading dashboard...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '80px 28px', textAlign: 'center', fontSize: 13, color: 'var(--red)' }}>
        Error loading dashboard: {error}
      </div>
    )
  }

  if (properties.length === 0) {
    return <DashboardEmptyState kind="no_properties" context="portfolio" />
  }

  const SortArrow = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span style={{ marginLeft: 4, color: '#bbb', fontSize: 9 }}>▾</span>
    }
    return (
      <span style={{ marginLeft: 4, color: '#1e3a5f', fontSize: 9 }}>
        {sortDir === 'desc' ? '▼' : '▲'}
      </span>
    )
  }

  const sortableHeaderStyle: CSSProperties = {
    cursor: 'pointer',
    userSelect: 'none',
  }

  return (
    <>
      <div style={{ padding: '20px 28px' }}>
        {/* Existing banner row */}
        <div className="dashboard-banner-row">
          <div className="dashboard-banner dashboard-banner-monitor">
            <span>
              <strong>Set up real-time monitoring</strong> — get alerts the moment something hits your portfolio
            </span>
            <button
              type="button"
              className="dashboard-banner-monitor-btn"
              onClick={() => {
                alert('Alert setup coming soon')
              }}
            >
              Set up →
            </button>
          </div>
          <div className="dashboard-banner dashboard-banner-right">
            <div className="dashboard-banner-right-left">
              <div className="dashboard-banner-count">{properties.length}</div>
              <div className="dashboard-banner-count-text">
                <strong>properties tracked</strong>
                <br />
                Search any address to add more
              </div>
            </div>
            <button
              type="button"
              className="dashboard-banner-add-btn"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
              }}
            >
              + Add property
            </button>
          </div>
        </div>

        {isAdmin && selectedIds.size > 0 ? (
          <div className="dashboard-sel-bar">
            <div className="dashboard-sel-text">
              {backfillJob && backfillJob.status === 'running' ? (
                <span>
                  Enriching {backfillJob.processed} / {backfillJob.total}…
                </span>
              ) : backfillJob && backfillJob.status === 'done' ? (
                <span style={{ color: '#166534' }}>
                  {backfillJob.message ? backfillJob.message : `Enriched ${backfillJob.processed} complaints (${backfillJob.failed} skipped)`}
                </span>
              ) : backfillJob && backfillJob.status === 'error' ? (
                <span style={{ color: 'var(--red, #c8102e)' }}>Backfill error: {backfillJob.message ?? 'unknown'}</span>
              ) : (
                <span>{selectedIds.size} selected</span>
              )}
            </div>
            <div className="dashboard-sel-btns">
              <button
                type="button"
                className="dashboard-sel-btn dashboard-sel-btn-backfill"
                onClick={() => void handleStartBackfill()}
                disabled={!!backfillJob && (backfillJob.status === 'running' || backfillJob.status === 'pending')}
              >
                {backfillJob && backfillJob.status === 'running' ? 'Enriching…' : 'Enrich 311 history'}
              </button>
              <button
                type="button"
                className="dashboard-sel-btn dashboard-sel-btn-audit"
                onClick={() => setShowAuditModal(true)}
                disabled={!!backfillJob && (backfillJob.status === 'running' || backfillJob.status === 'pending')}
              >
                Create audit
              </button>
              <button
                type="button"
                className="dashboard-sel-btn dashboard-sel-btn-remove"
                onClick={() => void handleRemoveSelected()}
                disabled={!!backfillJob && (backfillJob.status === 'running' || backfillJob.status === 'pending')}
              >
                Remove properties
              </button>
              <button
                type="button"
                className="dashboard-sel-btn dashboard-sel-btn-unselect"
                onClick={() => setSelectedIds(new Set())}
                disabled={!!backfillJob && (backfillJob.status === 'running' || backfillJob.status === 'pending')}
              >
                Unselect
              </button>
            </div>
          </div>
        ) : null}

        {selectedProperty ? (
          <PortfolioDetail
            property={selectedProperty}
            onClose={() => setSelectedId(null)}
            showItemDetails={true}
            isAdmin={isAdmin}
            ownerName={ownerName}
            onPropertyUpdated={() => {
              void loadPortfolioList()
            }}
          />
        ) : null}

        {/* Wave 4 toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '16px 0 12px',
            fontSize: 13,
          }}
        >
          <input
            type="search"
            placeholder="Search address or property name…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{
              flex: '1 1 280px',
              maxWidth: 380,
              padding: '7px 10px',
              border: '1px solid #d9d3c2',
              borderRadius: 4,
              fontSize: 13,
              fontFamily: 'inherit',
              background: '#fff',
            }}
          />
          <select
            value={filterTag}
            onChange={(e) => handleFilterTagChange(e.target.value)}
            style={toolbarSelect}
            aria-label="Filter by tag"
          >
            <option value="">All tags</option>
            {tagOptions.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => handleFilterStatusChange(e.target.value)}
            style={toolbarSelect}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>

          <div style={{ flex: 1 }} />

          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
            style={toolbarSelect}
            aria-label="Page size"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>

          <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>
            {sorted.length === properties.length
              ? `${properties.length} properties`
              : `${sorted.length} of ${properties.length}`}
          </span>
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr className="dashboard-thead-group">
                {isAdmin ? (
                  <th className="dashboard-th-ck" rowSpan={2}>
                    <input
                      type="checkbox"
                      checked={paginated.length > 0 && paginated.every((p) => selectedIds.has(p.id))}
                      onChange={toggleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </th>
                ) : null}
                <th
                  rowSpan={2}
                  style={{ width: 1, whiteSpace: 'nowrap', ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('address')}
                >
                  Name
                  <SortArrow field="address" />
                </th>
                <th
                  rowSpan={2}
                  style={{ width: 1, whiteSpace: 'nowrap', ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('community_area')}
                >
                  Neighborhood
                  <SortArrow field="community_area" />
                </th>
                <th
                  className="r"
                  rowSpan={2}
                  style={{ width: 1, whiteSpace: 'nowrap', ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('units_total')}
                >
                  Units
                  <SortArrow field="units_total" />
                </th>
                <th
                  rowSpan={2}
                  aria-hidden
                  style={{
                    width: '100%',
                    padding: 0,
                    borderBottom: '2px solid #e5e1d6',
                    fontSize: 0,
                    lineHeight: 0,
                  }}
                />
                <th
                  className="r dashboard-th-group"
                  colSpan={4}
                  style={{ borderBottom: '1px solid #e5e1d6' }}
                >
                  Complaints
                </th>
                <th
                  className="r"
                  rowSpan={2}
                  style={{ width: 95, ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('total_violations_12mo')}
                >
                  Violations
                  <SortArrow field="total_violations_12mo" />
                </th>
                <th
                  className="r"
                  rowSpan={2}
                  style={{ width: 80, ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('total_permits')}
                >
                  Permits
                  <SortArrow field="total_permits" />
                </th>
                <th
                  className="r"
                  rowSpan={2}
                  style={{ width: 100, ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('nearby_listings')}
                >
                  STR Listings
                  <SortArrow field="nearby_listings" />
                </th>
                <th rowSpan={2} style={{ width: 130 }}>
                  Flags
                </th>
                <th className="dashboard-th-actions" rowSpan={2} aria-label="Remove" />
              </tr>
              <tr>
                <th
                  className="r dashboard-th-sub"
                  style={{ width: 95, ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('latest_building_complaint_date')}
                >
                  Latest bldg
                  <SortArrow field="latest_building_complaint_date" />
                </th>
                <th
                  className="r dashboard-th-sub"
                  style={{ width: 65, ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('open_building_complaints')}
                >
                  Open
                  <SortArrow field="open_building_complaints" />
                </th>
                <th
                  className="r dashboard-th-sub"
                  style={{ width: 75, ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('total_building_complaints_12mo')}
                >
                  Building
                  <SortArrow field="total_building_complaints_12mo" />
                </th>
                <th
                  className="r dashboard-th-sub"
                  style={{ width: 60, ...sortableHeaderStyle }}
                  onClick={() => handleHeaderClick('total_complaints_12mo')}
                >
                  All
                  <SortArrow field="total_complaints_12mo" />
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 14 : 13}
                    style={{ padding: 36, textAlign: 'center', color: '#999', fontSize: 13 }}
                  >
                    No properties match these filters.
                  </td>
                </tr>
              ) : (
                paginated.map((p) => {
                  const flag = getFlag(p)
                  return (
                    <tr
                      key={p.id}
                      className={`${selectedId === p.id ? 'selected' : ''} ${selectedIds.has(p.id) ? 'checked' : ''}`}
                      onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                    >
                      {isAdmin ? (
                        <td className="dashboard-td-ck" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            aria-label={`Select ${p.display_name || p.canonical_address}`}
                          />
                        </td>
                      ) : null}
                      <td style={{ whiteSpace: 'nowrap', paddingRight: 16 }}>
                        <span className="dashboard-addr">{p.display_name || p.address_range || p.canonical_address}</span>
                      </td>
                      <td style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', paddingRight: 16 }}>
                        {p.community_area || <span className="zero">—</span>}
                      </td>
                      <td
                        className="r"
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 12,
                          color: '#444',
                          whiteSpace: 'nowrap',
                          paddingRight: 24,
                        }}
                      >
                        {p.units_total > 0 ? formatUnitsSummary(p) : <span className="zero">—</span>}
                      </td>
                      <td aria-hidden style={{ padding: 0, borderBottom: '1px solid #eceae4' }} />
                      <td className="r">
                        {(() => {
                          const ld = formatLatestDate(p.latest_building_complaint_date)
                          if (!ld) return <span className="zero">—</span>
                          return (
                            <span
                              title={ld.full}
                              style={{
                                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                                fontSize: 11,
                                color: '#444',
                                cursor: 'help',
                                borderBottom: '1px dotted #c4c0b4',
                              }}
                            >
                              {ld.short}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="r">
                        {p.open_building_complaints == null ? (
                          <span className="zero" title="Refresh property to populate">
                            —
                          </span>
                        ) : p.open_building_complaints > 0 ? (
                          <span style={{ color: '#b8302a', fontWeight: 600 }}>{p.open_building_complaints}</span>
                        ) : (
                          <span className="zero">0</span>
                        )}
                      </td>
                      <td className="r">
                        {p.total_building_complaints_12mo == null ? (
                          <span className="zero" title="Refresh property to populate">
                            —
                          </span>
                        ) : p.total_building_complaints_12mo > 0 ? (
                          p.total_building_complaints_12mo
                        ) : (
                          <span className="zero">0</span>
                        )}
                      </td>
                      <td className="r">
                        {(p.total_complaints_12mo ?? 0) > 0 ? p.total_complaints_12mo : <span className="zero">0</span>}
                      </td>
                      <td className="r">
                        {(p.total_violations_12mo ?? 0) > 0 ? (
                          p.total_violations_12mo ?? 0
                        ) : (
                          <span className="zero">0</span>
                        )}
                      </td>
                      <td className="r">
                        {p.total_permits > 0 ? p.total_permits : <span className="zero">0</span>}
                      </td>
                      <td className="r">
                        {(p.nearby_listings ?? 0) > 0 ? (
                          <button
                            type="button"
                            className="dashboard-val-link"
                            style={{ color: '#b87514', fontWeight: 500 }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setListingsProperty(p)
                            }}
                          >
                            {p.nearby_listings}
                          </button>
                        ) : (
                          <span className="zero">0</span>
                        )}
                      </td>
                      <td>
                        {flag ? (
                          <span className={`dashboard-flag ${flag.color}`}>
                            <span className={`dashboard-flag-dot ${flag.color}`} />
                            {flag.label}
                          </span>
                        ) : null}
                      </td>
                      <td className="dashboard-td-actions">
                        <button
                          type="button"
                          className="dashboard-delete-btn"
                          title="Remove from portfolio"
                          aria-label="Remove from portfolio"
                          onClick={(e) => handleDelete(e, p)}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '16px 0',
              fontSize: 13,
            }}
          >
            <button
              type="button"
              onClick={() => handlePageChange(safePage - 1)}
              disabled={safePage <= 1}
              style={{
                ...paginationBtn,
                opacity: safePage <= 1 ? 0.4 : 1,
                cursor: safePage <= 1 ? 'default' : 'pointer',
              }}
            >
              ‹ Prev
            </button>
            <span style={{ color: '#666', fontFamily: 'var(--mono)', fontSize: 12 }}>
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              style={{
                ...paginationBtn,
                opacity: safePage >= totalPages ? 0.4 : 1,
                cursor: safePage >= totalPages ? 'default' : 'pointer',
              }}
            >
              Next ›
            </button>
          </div>
        ) : null}

        {isAdmin ? <AuditList /> : null}
      </div>
      {showAuditModal ? (
        <CreateAuditModal
          isOpen={showAuditModal}
          onClose={(created) => {
            setShowAuditModal(false)
            if (created) setSelectedIds(new Set())
          }}
          selectedProperties={properties.filter((p) => selectedIds.has(p.id))}
        />
      ) : null}
      {listingsProperty && listingsCoords ? (
        <NearbyListingsModal
          isOpen
          onClose={() => {
            setListingsProperty(null)
            setListingsCoords(null)
          }}
          address={listingsProperty.display_name || listingsProperty.canonical_address}
          lat={listingsCoords.lat}
          lng={listingsCoords.lng}
        />
      ) : null}
    </>
  )
}

const toolbarSelect: CSSProperties = {
  padding: '7px 8px',
  border: '1px solid #d9d3c2',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'inherit',
  background: '#fff',
  color: '#1a1a1a',
  cursor: 'pointer',
  outline: 'none',
}

const paginationBtn: CSSProperties = {
  padding: '6px 14px',
  border: '1px solid #d9d3c2',
  borderRadius: 4,
  background: '#fff',
  fontSize: 13,
  fontFamily: 'inherit',
  color: '#1a1a1a',
}
