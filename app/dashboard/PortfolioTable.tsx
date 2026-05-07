'use client'

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import NearbyListingsModal from '@/components/NearbyListingsModal'
import AuditList from './AuditList'
import CreateAuditModal from './CreateAuditModal'
import PortfolioDetail from './PortfolioDetail'
import DashboardEmptyState from './DashboardEmptyState'
import type { PortfolioProperty } from './types'

type Props = {
  isAdmin?: boolean
}

export default function PortfolioTable({ isAdmin = false }: Props) {
  const [properties, setProperties] = useState<PortfolioProperty[]>([])
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

  const loadPortfolioList = useCallback(async () => {
    const listData = await fetch('/api/dashboard/list').then((r) => r.json())
    if (listData.error) {
      throw new Error(String(listData.error))
    }
    setProperties((listData.properties as PortfolioProperty[]) ?? [])
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
          setBackfillJob((prev) =>
            prev
              ? { ...prev, status: 'error', message: data.error }
              : prev
          )
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
          // Refresh portfolio so the detail panel re-fetches and shows new paraphrases
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

  const filtered = [...properties].sort((a, b) => {
    // Sort priority: open building complaints (actionable), then total building, then violations
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
  })

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)))
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

  return (
    <>
      <div style={{ padding: '20px 28px' }}>
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
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
                )
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
                  {backfillJob.message
                    ? backfillJob.message
                    : `Enriched ${backfillJob.processed} complaints (${backfillJob.failed} skipped)`}
                </span>
              ) : backfillJob && backfillJob.status === 'error' ? (
                <span style={{ color: 'var(--red, #c8102e)' }}>
                  Backfill error: {backfillJob.message ?? 'unknown'}
                </span>
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
                {backfillJob && backfillJob.status === 'running'
                  ? 'Enriching…'
                  : 'Enrich 311 history'}
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
          />
        ) : null}
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr className="dashboard-thead-group">
                {isAdmin ? (
                  <th className="dashboard-th-ck" rowSpan={2}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      aria-label="Select all properties"
                    />
                  </th>
                ) : null}
                <th rowSpan={2}>Address</th>
                <th
                  className="r dashboard-th-group"
                  colSpan={3}
                  style={{ borderBottom: '1px solid #e5e1d6' }}
                >
                  Complaints
                </th>
                <th className="r" rowSpan={2} style={{ width: 95 }}>
                  Violations
                </th>
                <th className="r" rowSpan={2} style={{ width: 80 }}>
                  Permits
                </th>
                <th className="r" rowSpan={2} style={{ width: 100 }}>
                  STR Listings
                </th>
                <th rowSpan={2} style={{ width: 130 }}>
                  Flags
                </th>
                <th className="dashboard-th-actions" rowSpan={2} aria-label="Remove" />
              </tr>
              <tr>
                <th className="r dashboard-th-sub" style={{ width: 80 }}>
                  Open
                </th>
                <th className="r dashboard-th-sub" style={{ width: 95 }}>
                  Building 12mo
                </th>
                <th className="r dashboard-th-sub" style={{ width: 90 }}>
                  All 12mo
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
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
                    <td>
                      <span className="dashboard-addr">{p.display_name || p.address_range || p.canonical_address}</span>
                      <span className="dashboard-addr-hood">{p.community_area || ''}</span>
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
                      {(p.total_complaints_12mo ?? 0) > 0 ? (
                        p.total_complaints_12mo
                      ) : (
                        <span className="zero">0</span>
                      )}
                    </td>
                    <td className="r">
                      {(p.total_violations_12mo ?? 0) > 0 ? p.total_violations_12mo ?? 0 : <span className="zero">0</span>}
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
