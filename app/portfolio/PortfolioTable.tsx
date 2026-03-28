'use client'

import { useEffect, useState } from 'react'
import PortfolioDetail from './PortfolioDetail'
import type { PortfolioProperty } from './types'

type FilterTag = 'all' | 'risk' | 'pbl' | 'str'

export default function PortfolioTable() {
  const [properties, setProperties] = useState<PortfolioProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTag>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<string>('')
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetch('/api/portfolio/list').then((r) => r.json()),
      fetch('/api/profile/update').then((r) => r.json()),
    ])
      .then(([listData, profileData]: [Record<string, unknown>, Record<string, unknown>]) => {
        if (cancelled) return
        const org = (profileData.profile as { organization?: string | null } | undefined)?.organization
        if (org && String(org).trim()) {
          setOrgName(String(org).trim())
        }
        if (listData.error) {
          throw new Error(String(listData.error))
        }
        setProperties((listData.properties as PortfolioProperty[]) ?? [])
        setSyncedAt('just now')
      })
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
  }, [])

  const getStatus = (p: PortfolioProperty): { label: string; cls: string; tags: string[] } => {
    const tags: string[] = []
    if (p.is_pbl) tags.push('pbl', 'risk')
    if (p.shvr_count > 0) tags.push('str', 'risk')
    if (p.has_stop_work) tags.push('risk')
    if (p.open_violations > 10) tags.push('risk')

    if (p.is_pbl) return { label: 'PBL', cls: 'badge-red', tags }
    if (p.shvr_count > 0) return { label: 'STR risk', cls: 'badge-amber', tags }
    if (p.has_stop_work) return { label: 'Stop work', cls: 'badge-red', tags }
    return { label: 'Clear', cls: 'badge-green', tags }
  }

  const filtered = properties.filter((p) => {
    if (filter === 'all') return true
    const { tags } = getStatus(p)
    return tags.includes(filter)
  })

  const selectedProperty = properties.find((p) => p.id === selectedId) ?? null

  const alertCount = properties.filter((p) => p.alerts_enabled).length

  const headerTitle = orgName ? `${orgName} Portfolio` : 'Portfolio'

  const headerMeta = `${properties.length} properties · ${alertCount} alerts active`

  const syncedLabel = (
    <span
      style={{
        fontFamily: 'var(--mono)',
        fontSize: '10px',
        color: 'var(--text-dim)',
        letterSpacing: '0.04em',
      }}
    >
      Synced {syncedAt || '—'}
    </span>
  )

  if (loading) {
    return (
      <>
        <div className="address-header portfolio-page-header">
          <div style={{ flex: 1 }}>
            <div className="address-header-street">Portfolio</div>
          </div>
        </div>
        <div
          style={{
            padding: '80px 28px',
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--text-dim)',
          }}
        >
          Loading portfolio...
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="address-header portfolio-page-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="address-header-street">{headerTitle}</div>
          </div>
        </div>
        <div style={{ padding: '80px 28px', textAlign: 'center', fontSize: 13, color: 'var(--red)' }}>
          Error loading portfolio: {error}
        </div>
      </>
    )
  }

  if (properties.length === 0) {
    return (
      <>
        <div className="address-header portfolio-page-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="address-header-street">{headerTitle}</div>
            <div className="address-header-meta">{headerMeta}</div>
          </div>
          {syncedLabel}
        </div>
        <div style={{ padding: '80px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Add your first property</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, maxWidth: 360, margin: '0 auto' }}>
            Search for any Chicago address and click the save icon to add it to your portfolio.
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="address-header portfolio-page-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="address-header-street">{headerTitle}</div>
          <div className="address-header-meta">{headerMeta}</div>
        </div>
        {syncedLabel}
      </div>
      <div style={{ padding: '20px 28px' }}>
        <div className="portfolio-toolbar">
          <div className="portfolio-toggle-group">
            {(['all', 'risk', 'pbl', 'str'] as FilterTag[]).map((tag) => (
              <button
                key={tag}
                type="button"
                className={`portfolio-toggle-btn ${filter === tag ? 'active' : ''}`}
                onClick={() => {
                  setFilter(tag)
                  setSelectedId(null)
                }}
              >
                {tag === 'all' ? 'All buildings' : tag === 'risk' ? 'At risk' : tag === 'pbl' ? 'PBL' : 'STR activity'}
              </button>
            ))}
          </div>
        </div>

        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Building</th>
                <th>Status</th>
                <th>Neighborhood</th>
                <th className="right">Units</th>
                <th className="right">Sqft</th>
                <th className="center">311</th>
                <th className="center">STR</th>
                <th className="center">Violations</th>
                <th className="center">Permits</th>
                <th className="center">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const status = getStatus(p)
                const chars = p.building_chars as { building_sqft?: number | string | null } | null
                const charSqft = chars?.building_sqft
                const sqftDisplay =
                  p.sqft_override != null
                    ? p.sqft_override.toLocaleString()
                    : charSqft != null && String(charSqft) !== ''
                      ? Number(charSqft).toLocaleString()
                      : 'N/A'
                return (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? 'selected' : ''}
                    onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  >
                    <td>
                      <div className="portfolio-bld-name">{p.display_name || p.address_range || p.canonical_address}</div>
                      <div className="portfolio-bld-addr">
                        {p.address_range || p.canonical_address}
                        {(p.additional_streets ?? []).map((s, i) => (
                          <span key={i}>
                            {' & '}
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`portfolio-badge ${status.cls}`}>{status.label}</span>
                    </td>
                    <td>
                      <span className="portfolio-meta">{p.community_area || 'N/A'}</span>
                    </td>
                    <td className="right">
                      <span className="portfolio-meta">{p.units_override != null ? p.units_override.toLocaleString() : 'N/A'}</span>
                    </td>
                    <td className="right">
                      <span className="portfolio-meta">{sqftDisplay}</span>
                    </td>
                    <td className="center">
                      <span
                        className={
                          p.open_complaints > 5
                            ? 'portfolio-num-amber'
                            : p.open_complaints > 0
                              ? 'portfolio-num-dim'
                              : 'portfolio-num-green'
                        }
                      >
                        {p.open_complaints}
                      </span>
                    </td>
                    <td className="center">
                      {p.shvr_count > 0 ? (
                        <span className="portfolio-badge badge-red">{p.shvr_count} SHVR</span>
                      ) : (
                        <span className="portfolio-num-dim">—</span>
                      )}
                    </td>
                    <td className="center">
                      <span className={p.open_violations > 0 ? 'portfolio-num-red' : 'portfolio-num-green'}>{p.open_violations}</span>
                    </td>
                    <td className="center">
                      <span className="portfolio-num-dim">{p.total_permits}</span>
                    </td>
                    <td className="center">
                      <span className={`portfolio-alert-dot ${p.alerts_enabled ? 'on' : 'off'}`} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="portfolio-table-footer">
            Showing {filtered.length} of {properties.length} buildings
          </div>
        </div>

        {selectedProperty && <PortfolioDetail property={selectedProperty} onClose={() => setSelectedId(null)} />}
      </div>
    </>
  )
}
