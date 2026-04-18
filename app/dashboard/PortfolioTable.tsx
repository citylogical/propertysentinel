'use client'

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import PortfolioDetail from './PortfolioDetail'
import type { PortfolioProperty } from './types'

export default function PortfolioTable() {
  const [properties, setProperties] = useState<PortfolioProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<string>('')
  const [orgName, setOrgName] = useState('')

  const loadPortfolioList = useCallback(async () => {
    const listData = await fetch('/api/dashboard/list').then((r) => r.json())
    if (listData.error) {
      throw new Error(String(listData.error))
    }
    setProperties((listData.properties as PortfolioProperty[]) ?? [])
    setSyncedAt('just now')
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      loadPortfolioList(),
      fetch('/api/profile/update').then((r) => r.json()),
    ])
      .then(([, profileData]: [void, Record<string, unknown>]) => {
        if (cancelled) return
        const org = (profileData.profile as { organization?: string | null } | undefined)?.organization
        if (org && String(org).trim()) {
          setOrgName(String(org).trim())
        }
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
  }, [loadPortfolioList])

  const filtered = properties

  const selectedProperty = properties.find((p) => p.id === selectedId) ?? null

  const headerTitle = orgName ? `${orgName} Dashboard` : 'Dashboard'

  const getFlag = (p: PortfolioProperty): { label: string; color: 'red' | 'amber' } | null => {
    if (p.has_stop_work) return { label: 'Stop work', color: 'red' }
    if (p.open_violations >= 3) return { label: `${p.open_violations} open viol`, color: 'red' }
    if (p.open_violations > 0) return { label: `${p.open_violations} open viol`, color: 'red' }
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
        await loadPortfolioList()
      }
    } catch (err) {
      console.error('Failed to remove property:', err)
    }
  }

  if (loading) {
    return (
      <>
        <div className="dashboard-identity-row">
          <div className="dashboard-identity-left">
            <div className="dashboard-logo">PS</div>
            <div className="dashboard-identity-text">
              <h1 className="dashboard-identity-name">Dashboard</h1>
            </div>
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
          Loading dashboard...
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="dashboard-identity-row">
          <div className="dashboard-identity-left">
            <div className="dashboard-logo">{orgName ? orgName.slice(0, 2).toUpperCase() : 'PS'}</div>
            <div className="dashboard-identity-text">
              <h1 className="dashboard-identity-name">{headerTitle}</h1>
            </div>
          </div>
        </div>
        <div style={{ padding: '80px 28px', textAlign: 'center', fontSize: 13, color: 'var(--red)' }}>
          Error loading dashboard: {error}
        </div>
      </>
    )
  }

  if (properties.length === 0) {
    return (
      <>
        <div className="dashboard-identity-row">
          <div className="dashboard-identity-left">
            <div className="dashboard-logo">{orgName ? orgName.slice(0, 2).toUpperCase() : 'PS'}</div>
            <div className="dashboard-identity-text">
              <h1 className="dashboard-identity-name">{headerTitle}</h1>
              <div className="dashboard-identity-sub">
                {properties.length} properties · {syncedAt ? `Updated ${syncedAt}` : ''}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: '80px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Add your first property</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, maxWidth: 360, margin: '0 auto' }}>
            Search for any Chicago address and click the save icon to add it to your dashboard.
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="dashboard-identity-row">
        <div className="dashboard-identity-left">
          <div className="dashboard-logo">{orgName ? orgName.slice(0, 2).toUpperCase() : 'PS'}</div>
          <div className="dashboard-identity-text">
            <h1 className="dashboard-identity-name">{headerTitle}</h1>
            <div className="dashboard-identity-sub">
              {properties.length} properties · Last 12 months ·{' '}
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>
        <div className="dashboard-inline-stats">
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">
              {properties.reduce((s, p) => s + (p.open_complaints ?? 0), 0)}
            </div>
            <div className="dashboard-istat-label">Complaints</div>
          </div>
          <div className="dashboard-istat-sep" />
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">
              {properties.reduce((s, p) => s + (p.open_violations ?? 0), 0)}
            </div>
            <div className="dashboard-istat-label">Violations</div>
          </div>
          <div className="dashboard-istat-sep" />
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">
              {properties.filter((p) => p.open_violations > 0).reduce((s, p) => s + p.open_violations, 0)}
            </div>
            <div className="dashboard-istat-label">Open</div>
          </div>
          <div className="dashboard-istat-sep" />
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">
              {properties.reduce((s, p) => s + (p.total_permits ?? 0), 0)}
            </div>
            <div className="dashboard-istat-label">Permits</div>
          </div>
          <div className="dashboard-istat-sep" />
          <div className="dashboard-istat">
            <div className="dashboard-istat-num">
              {properties.filter((p) => p.shvr_count > 0 || p.is_pbl).length}
            </div>
            <div className="dashboard-istat-label">STR flags</div>
          </div>
        </div>
      </div>
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
        {selectedProperty && <PortfolioDetail property={selectedProperty} onClose={() => setSelectedId(null)} />}
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Address</th>
                <th className="r">Complaints</th>
                <th className="r">Violations</th>
                <th className="r">Open</th>
                <th className="r">Permits</th>
                <th className="r">STR</th>
                <th>Flags</th>
                <th className="dashboard-th-actions" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const flag = getFlag(p)
                const strCount = (p.shvr_count ?? 0) + (p.is_pbl ? 1 : 0)
                return (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? 'selected' : ''}
                    onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  >
                    <td>
                      <span className="dashboard-addr">{p.display_name || p.address_range || p.canonical_address}</span>
                      <span className="dashboard-addr-hood">{p.community_area || ''}</span>
                    </td>
                    <td className="r">
                      {p.open_complaints > 0 ? p.open_complaints : <span className="zero">0</span>}
                    </td>
                    <td className="r">
                      {p.open_violations > 0 ? p.open_violations : <span className="zero">0</span>}
                    </td>
                    <td className="r">
                      {p.open_violations > 0 ? p.open_violations : <span className="zero">0</span>}
                    </td>
                    <td className="r">
                      {p.total_permits > 0 ? p.total_permits : <span className="zero">0</span>}
                    </td>
                    <td className="r">{strCount > 0 ? strCount : <span className="zero">0</span>}</td>
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
      </div>
    </>
  )
}
