'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Drill-down modal for the PM Lead Intel explore table: one PM company's
// buildings at address grain with their open hot 311 complaints, plus
// checkbox-add into the dashboard staging queue (the only sanctioned door
// into the portfolio — commitment/entitlement happens later at commit time).

type OpenComplaint = {
  sr_number: string
  sr_short_code: string | null
  sr_type: string | null
  created_date: string | null
}

type Building = {
  address: string
  display_address: string
  slug: string
  building_name: string | null
  roles: string[]
  sources: string[]
  units: number | null
  city: string | null
  zip: string | null
  community_area: string | null
  pins: string[]
  /** Currently-open hot complaints, any age. */
  open_hot: number
  /** Hot complaints filed in the last 90 days — matches the table's Hot 90d. */
  hot_90d: number
  last_hot: string | null
  open_complaints: OpenComplaint[]
}

type Totals = {
  buildings: number
  open_hot: number
  open_hot_90d: number
  hot_90d: number
}

type ApiResponse = {
  company?: { id: number; name: string; segment: string | null }
  totals?: Totals
  buildings?: Building[]
  error?: string
}

type Props = {
  companyId: number
  companyName: string
  onClose: () => void
}

const SOURCE_LABELS: Record<string, string> = {
  hud_mf: 'HUD',
  arhd: 'ARHD',
  kcro: 'KCRO',
}

export default function PmHotBuildingsModal({ companyId, companyName, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [segment, setSegment] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [staged, setStaged] = useState<Set<string>>(new Set())
  const [staging, setStaging] = useState(false)
  const [stageMessage, setStageMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setBuildings([])
    setTotals(null)
    setSelected(new Set())
    setExpanded(new Set())
    setStaged(new Set())
    setStageMessage(null)
    void (async () => {
      try {
        const res = await fetch(`/api/leads/pm-hot-buildings?companyId=${companyId}`)
        const json = (await res.json()) as ApiResponse
        if (cancelled) return
        if (!res.ok || json.error) {
          setError(json.error ?? 'Could not load buildings.')
          return
        }
        setBuildings(json.buildings ?? [])
        setTotals(json.totals ?? null)
        setSegment(json.company?.segment ?? null)
      } catch {
        if (!cancelled) setError('Network error.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [companyId])

  const toggleSelected = useCallback((address: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(address)) next.delete(address)
      else next.add(address)
      return next
    })
  }, [])

  const toggleExpanded = useCallback((address: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(address)) next.delete(address)
      else next.add(address)
      return next
    })
  }, [])

  const allSelected = buildings.length > 0 && selected.size === buildings.length
  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === buildings.length ? new Set() : new Set(buildings.map((b) => b.address))
    )
  }, [buildings])

  const selectedBuildings = useMemo(
    () => buildings.filter((b) => selected.has(b.address)),
    [buildings, selected]
  )

  const handleAddToQueue = useCallback(async () => {
    if (staging || selectedBuildings.length === 0) return
    setStaging(true)
    setStageMessage(null)
    let ok = 0
    let failed = 0
    for (const b of selectedBuildings) {
      try {
        const res = await fetch('/api/dashboard/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canonical_address: b.address,
            slug: b.slug,
            property_name: b.building_name || b.display_address,
            units: b.units,
            address_range: b.display_address,
            pins: b.pins,
            community_area: b.community_area,
          }),
        })
        if (res.ok) {
          ok++
          setStaged((prev) => new Set(prev).add(b.address))
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }
    setStaging(false)
    setSelected(new Set())
    setStageMessage(
      failed === 0
        ? `Added ${ok} ${ok === 1 ? 'building' : 'buildings'} to your dashboard queue.`
        : `Added ${ok}, ${failed} failed — try again.`
    )
  }, [staging, selectedBuildings])

  return (
    <div className="explore-modal-backdrop" onClick={onClose}>
      <div
        className="explore-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 860 }}
      >
        <div className="explore-modal-header">
          <div>
            <div className="explore-modal-title">{companyName}</div>
            <div className="explore-modal-address">
              {totals
                ? `${totals.buildings} ${totals.buildings === 1 ? 'building' : 'buildings'} · ${totals.open_hot} open hot (any age) · ${totals.hot_90d} hot in 90d, ${totals.open_hot_90d} of them open${segment ? ` · ${segment}` : ''}`
                : 'Buildings & open hot complaints'}
            </div>
          </div>
          <button type="button" className="explore-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="explore-modal-body">
          {loading ? (
            <div className="explore-modal-loading">Loading buildings…</div>
          ) : error ? (
            <div className="explore-modal-loading">{error}</div>
          ) : buildings.length === 0 ? (
            <div className="explore-modal-loading">No buildings on file for this company.</div>
          ) : (
            <table className="explore-modal-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all buildings"
                    />
                  </th>
                  <th>Address</th>
                  <th>Role</th>
                  <th>Units</th>
                  <th>Open Hot</th>
                  <th>Hot 90d</th>
                  <th>Last Hot</th>
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => {
                  const isExpanded = expanded.has(b.address)
                  const isStaged = staged.has(b.address)
                  return [
                    <tr key={b.address}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(b.address)}
                          onChange={() => toggleSelected(b.address)}
                          aria-label={`Select ${b.display_address}`}
                        />
                      </td>
                      <td>
                        <a
                          href={`/address/${b.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#0f2744', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {b.display_address}
                        </a>
                        {b.building_name ? (
                          <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 11 }}>
                            {b.building_name}
                          </span>
                        ) : null}
                        {isStaged ? (
                          <span
                            style={{
                              fontFamily: "'DM Mono', monospace",
                              fontSize: 9,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: '#166534',
                              marginLeft: 8,
                            }}
                          >
                            Queued
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {b.roles.join(' + ')}
                        <span style={{ color: '#9ca3af', marginLeft: 6, fontSize: 10 }}>
                          {b.sources.map((s) => SOURCE_LABELS[s] ?? s.toUpperCase()).join(', ')}
                        </span>
                      </td>
                      <td>{b.units != null ? b.units.toLocaleString('en-US') : '—'}</td>
                      <td>
                        {b.open_hot > 0 ? (
                          <button
                            type="button"
                            className="explore-drill-link"
                            onClick={() => toggleExpanded(b.address)}
                            title={isExpanded ? 'Hide open complaints' : 'Show open complaints'}
                          >
                            <span className="explore-modal-badge badge-open">{b.open_hot}</span>
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{b.hot_90d > 0 ? b.hot_90d : '—'}</td>
                      <td>{b.last_hot ?? '—'}</td>
                    </tr>,
                    isExpanded && b.open_complaints.length > 0 ? (
                      <tr key={`${b.address}-detail`}>
                        <td />
                        <td colSpan={6} style={{ padding: '4px 8px 10px' }}>
                          {b.open_complaints.map((c) => (
                            <div
                              key={c.sr_number}
                              style={{ fontSize: 11, color: '#4b5563', padding: '2px 0' }}
                            >
                              <span
                                style={{
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: 10,
                                  letterSpacing: '0.04em',
                                  color: '#c0392b',
                                  marginRight: 8,
                                }}
                              >
                                {c.created_date ?? '—'}
                              </span>
                              {c.sr_type ?? c.sr_short_code ?? 'Unknown type'}
                              <span
                                style={{
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: 10,
                                  color: '#9ca3af',
                                  marginLeft: 8,
                                }}
                              >
                                {c.sr_number}
                              </span>
                            </div>
                          ))}
                          {b.open_hot > b.open_complaints.length ? (
                            <div style={{ fontSize: 10, color: '#9ca3af', paddingTop: 2 }}>
                              Showing {b.open_complaints.length} of {b.open_hot} open
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="explore-modal-footer">
          <span>
            {stageMessage ??
              (selected.size > 0
                ? `${selected.size} selected`
                : 'Select buildings to add them to your portfolio queue.')}
          </span>
          <button
            type="button"
            className="explore-btn"
            disabled={selected.size === 0 || staging}
            onClick={handleAddToQueue}
            style={{ marginLeft: 'auto' }}
          >
            {staging
              ? 'Adding…'
              : `Add ${selected.size > 0 ? selected.size : ''} to portfolio queue`.replace('  ', ' ')}
          </button>
        </div>
      </div>
    </div>
  )
}
