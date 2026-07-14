'use client'

import { useState, type CSSProperties } from 'react'
import ActivityFeedClient from '@/app/dashboard/activity/ActivityFeedClient'
import PortfolioDetail from '@/app/dashboard/PortfolioDetail'
import type { PortfolioProperty } from '@/app/dashboard/types'

export type DemoHighlights = {
  complaints12mo: number
  openComplaints: number
  latestComplaint: string | null
  violations12mo: number
  openViolations: number
  permits12mo: number
  propertiesWithActivity: number
  departments: { department: string; count: number; open: number }[]
}

type Props = {
  demo: {
    slug: string
    companyName: string
    initials: string
    sampleDescription: string
  }
  properties: PortfolioProperty[]
  highlights: DemoHighlights
  todayStr: string
}

type TabKey = 'highlights' | 'activity' | 'portfolio'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'highlights', label: 'Highlights' },
  { key: 'activity', label: 'Activity Feed' },
  { key: 'portfolio', label: 'Portfolio' },
]

// Digest-style category colors (see renderEmailHtml in the daily-digest cron).
const COMPLAINT_NAVY = '#1e3a5f'
const VIOLATION_RED = '#b8302a'
const PERMIT_GREEN = '#166534'

// City departments as stored on SR codes → short display labels.
const DEPT_SHORT: Record<string, string> = {
  'DOB - Buildings': 'Buildings (DOB)',
  'DWM - Department of Water Management': 'Water Management',
  'Streets and Sanitation': 'Streets & Sanitation',
  'CDOT - Department of Transportation': 'Transportation (CDOT)',
  'BACP - Business Affairs and Consumer Protection': 'Business Affairs (BACP)',
  'Animal Care and Control': 'Animal Care & Control',
  'Department of Housing': 'Housing',
  Health: 'Health',
  Fire: 'Fire',
}

function deptLabel(department: string): string {
  return DEPT_SHORT[department] ?? department
}

// Chicago-local-stored-as-fake-UTC timestamp → wall-clock date, no tz shift.
function formatCityDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const base = dateStr.slice(0, 10)
  const d = new Date(`${base}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DemoView({ demo, properties, highlights, todayStr }: Props) {
  const [tab, setTab] = useState<TabKey>('highlights')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedProperty = properties.find((p) => p.id === selectedId) ?? null

  const sorted = [...properties].sort((a, b) => {
    const ao = a.open_building_complaints ?? 0
    const bo = b.open_building_complaints ?? 0
    if (bo !== ao) return bo - ao
    const ab = a.total_building_complaints_12mo ?? a.total_complaints_12mo ?? 0
    const bb = b.total_building_complaints_12mo ?? b.total_complaints_12mo ?? 0
    if (bb !== ab) return bb - ab
    const av = a.total_violations_12mo ?? 0
    const bv = b.total_violations_12mo ?? 0
    if (bv !== av) return bv - av
    return (b.total_permits ?? 0) - (a.total_permits ?? 0)
  })

  const topBuildings = sorted.slice(0, 5)
  const maxDeptCount = Math.max(1, ...highlights.departments.map((d) => d.count))

  const getFlag = (p: PortfolioProperty): { label: string; color: 'red' | 'amber' } | null => {
    if (p.has_stop_work) return { label: 'Stop work', color: 'red' }
    if (p.is_pbl) return { label: 'PBL', color: 'amber' }
    if ((p.shvr_count ?? 0) > 0) return { label: `${p.shvr_count} SHVR`, color: 'amber' }
    return null
  }

  return (
    <div className="prop-main-content">
      <header
        style={{
          borderBottom: '1px solid #e5e1d6',
          background: 'var(--bg)',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div className="dashboard-identity-row" style={{ borderBottom: 'none' }}>
          <div className="dashboard-identity-left">
            <div className="dashboard-logo">{demo.initials}</div>
            <div className="dashboard-identity-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0 }}>{demo.companyName}</h1>
              </div>
              <div className="dashboard-identity-sub">Live demo · Last 12 months · {todayStr}</div>
            </div>
          </div>

          <div style={headerRightStyle} className="dashboard-header-right">
            <div style={statBlockStyle}>
              <div style={statValueStyle}>{properties.length}</div>
              <div style={statLabelStyle}>Properties</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32, padding: '0 32px' }}>
          {TABS.map((t) => {
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  padding: '14px 0',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 14,
                  fontWeight: 500,
                  color: isActive ? '#0f2744' : '#6b7280',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #0f2744' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </header>

      {tab === 'highlights' ? (
        <div style={{ padding: '20px 28px' }}>
          {/* Intro */}
          <div style={cardStyle}>
            <div style={cardBodyStyle}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#333' }}>
                {demo.sampleDescription}
              </p>
              <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.7, color: '#666' }}>
                {highlights.propertiesWithActivity} of {properties.length} properties in this
                sample had reportable activity in the last 12 months. Counts update automatically
                as the City of Chicago publishes new records — 311 complaints sync every
                15&nbsp;minutes.
              </p>
              <div style={monoFootnoteStyle}>
                TRACKING 29 OWNER-RELEVANT 311 CATEGORIES · DOB VIOLATIONS · BUILDING PERMITS
              </div>
            </div>
          </div>

          {/* Digest-style tri-count */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ ...statTileStyle }}>
              <div style={{ ...bigNumStyle, color: COMPLAINT_NAVY }}>
                {highlights.complaints12mo}
              </div>
              <div style={tileLabelStyle}>311 Complaints</div>
              <div style={tileSubStyle}>
                {highlights.openComplaints > 0 ? (
                  <span style={{ color: VIOLATION_RED, fontWeight: 600 }}>
                    {highlights.openComplaints} open now
                  </span>
                ) : (
                  'none open'
                )}
                {highlights.latestComplaint
                  ? ` · latest ${formatCityDate(highlights.latestComplaint)}`
                  : ''}
              </div>
            </div>
            <div style={{ ...statTileStyle }}>
              <div style={{ ...bigNumStyle, color: VIOLATION_RED }}>
                {highlights.violations12mo}
              </div>
              <div style={tileLabelStyle}>Building Violations</div>
              <div style={tileSubStyle}>
                {highlights.openViolations > 0 ? (
                  <span style={{ color: VIOLATION_RED, fontWeight: 600 }}>
                    {highlights.openViolations} open or failed
                  </span>
                ) : (
                  'none open'
                )}
              </div>
            </div>
            <div style={{ ...statTileStyle }}>
              <div style={{ ...bigNumStyle, color: PERMIT_GREEN }}>{highlights.permits12mo}</div>
              <div style={tileLabelStyle}>Building Permits</div>
              <div style={tileSubStyle}>issued in the last 12 months</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Department exposure */}
            <div style={{ ...cardStyle, flex: '2 1 420px', marginTop: 0 }}>
              <div style={cardHeaderStyle}>311 exposure by city department</div>
              <div style={cardBodyStyle}>
                {highlights.departments.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#888' }}>
                    No owner-relevant complaints in the last 12 months.
                  </div>
                ) : (
                  highlights.departments.map((d) => (
                    <div
                      key={d.department}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }}
                    >
                      <div style={deptLabelStyle}>{deptLabel(d.department)}</div>
                      <div style={{ flex: 1, height: 14, background: '#eeebe3' }}>
                        <div
                          style={{
                            width: `${Math.max(2, Math.round((d.count / maxDeptCount) * 100))}%`,
                            height: '100%',
                            background: COMPLAINT_NAVY,
                          }}
                        />
                      </div>
                      <div style={deptCountStyle}>
                        {d.count}
                        {d.open > 0 ? (
                          <span style={{ color: VIOLATION_RED, fontWeight: 600 }}>
                            {' '}
                            · {d.open} open
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top buildings */}
            <div style={{ ...cardStyle, flex: '1 1 320px', marginTop: 0 }}>
              <div style={cardHeaderStyle}>Buildings to watch</div>
              <div style={{ ...cardBodyStyle, padding: '4px 0' }}>
                {topBuildings.map((p) => {
                  const flag = getFlag(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id)
                        setTab('portfolio')
                      }}
                      style={topBuildingRowStyle}
                    >
                      <span>
                        <span className="dashboard-addr">
                          {p.display_name || p.canonical_address}
                        </span>
                        {flag ? (
                          <span className={`dashboard-flag ${flag.color}`} style={{ marginLeft: 8 }}>
                            <span className={`dashboard-flag-dot ${flag.color}`} />
                            {flag.label}
                          </span>
                        ) : null}
                      </span>
                      <span style={topBuildingCountsStyle}>
                        {(p.open_building_complaints ?? 0) > 0 ? (
                          <span style={{ color: VIOLATION_RED, fontWeight: 600 }}>
                            {p.open_building_complaints} open ·{' '}
                          </span>
                        ) : null}
                        {p.total_building_complaints_12mo ?? p.total_complaints_12mo ?? 0} complaints
                        {(p.open_violations ?? 0) > 0
                          ? ` · ${p.open_violations} open viol.`
                          : ''}
                      </span>
                    </button>
                  )
                })}
                <div style={{ padding: '8px 18px 10px', fontSize: 12, color: '#888' }}>
                  Ranked by open building complaints. Tap a building for the full record.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <ActivityFeedClient endpoint={`/api/demo/activity?slug=${encodeURIComponent(demo.slug)}`} />
      ) : null}

      {tab === 'portfolio' ? (
        <div style={{ padding: '20px 28px' }}>
          {selectedProperty ? (
            <PortfolioDetail
              property={selectedProperty}
              onClose={() => setSelectedId(null)}
              detailEndpoint={`/api/demo/detail?slug=${encodeURIComponent(demo.slug)}&property_id=${encodeURIComponent(selectedProperty.id)}`}
              showHistoricalActivityBar={false}
              showItemDetails={true}
              isAdmin={false}
            />
          ) : null}

          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr className="dashboard-thead-group">
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
                </tr>
                <tr>
                  <th className="r dashboard-th-sub" style={{ width: 80 }}>
                    Open
                  </th>
                  <th className="r dashboard-th-sub" style={{ width: 95 }}>
                    Building
                  </th>
                  <th className="r dashboard-th-sub" style={{ width: 90 }}>
                    All
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const flag = getFlag(p)
                  return (
                    <tr
                      key={p.id}
                      className={selectedId === p.id ? 'selected' : ''}
                      onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                    >
                      <td>
                        <span className="dashboard-addr">
                          {p.display_name || p.address_range || p.canonical_address}
                        </span>
                        <span className="dashboard-addr-hood">{p.community_area || ''}</span>
                      </td>
                      <td className="r">
                        {p.open_building_complaints == null ? (
                          <span className="zero">—</span>
                        ) : p.open_building_complaints > 0 ? (
                          <span style={{ color: VIOLATION_RED, fontWeight: 600 }}>
                            {p.open_building_complaints}
                          </span>
                        ) : (
                          <span className="zero">0</span>
                        )}
                      </td>
                      <td className="r">
                        {p.total_building_complaints_12mo == null ? (
                          <span className="zero">—</span>
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
                        {(p.total_violations_12mo ?? 0) > 0 ? (
                          p.total_violations_12mo
                        ) : (
                          <span className="zero">0</span>
                        )}
                      </td>
                      <td className="r">
                        {(p.total_permits ?? 0) > 0 ? p.total_permits : <span className="zero">0</span>}
                      </td>
                      <td className="r">
                        {(p.nearby_listings ?? 0) > 0 ? (
                          <span style={{ color: '#b87514', fontWeight: 500 }}>{p.nearby_listings}</span>
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: 20,
              padding: '14px 18px',
              background: '#f7f6f2',
              border: '1px solid #e5e1d6',
              fontSize: 13,
              color: '#666',
              lineHeight: 1.6,
              fontStyle: 'italic',
            }}
          >
            Compiled from publicly available City of Chicago records. Counts refresh
            automatically as new data is published.
          </div>
        </div>
      ) : null}
    </div>
  )
}

const headerRightStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
}

const statBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 56,
}

const statValueStyle: CSSProperties = {
  fontFamily: 'var(--sans, "DM Sans", system-ui, sans-serif)',
  fontSize: 16,
  fontWeight: 600,
  color: '#0f2744',
  lineHeight: 1.1,
}

const statLabelStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#8a94a0',
  marginTop: 2,
}

const cardStyle: CSSProperties = {
  background: '#fff',
  borderRadius: 'var(--card-radius, 8px)',
  boxShadow: 'var(--card-shadow, 0 1px 3px rgba(15, 39, 68, 0.08))',
  overflow: 'hidden',
}

const cardHeaderStyle: CSSProperties = {
  background: '#0f2744',
  color: '#f2f0eb',
  padding: '10px 18px',
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const cardBodyStyle: CSSProperties = {
  padding: '16px 18px',
}

const monoFootnoteStyle: CSSProperties = {
  marginTop: 12,
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10,
  letterSpacing: '0.08em',
  color: '#8a94a0',
}

const statTileStyle: CSSProperties = {
  flex: '1 1 200px',
  background: '#fff',
  borderRadius: 'var(--card-radius, 8px)',
  boxShadow: 'var(--card-shadow, 0 1px 3px rgba(15, 39, 68, 0.08))',
  padding: '18px 20px',
}

const bigNumStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 30,
  fontWeight: 500,
  lineHeight: 1.1,
}

const tileLabelStyle: CSSProperties = {
  marginTop: 6,
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#8a94a0',
}

const tileSubStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: '#666',
}

const deptLabelStyle: CSSProperties = {
  width: 190,
  flexShrink: 0,
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#333',
}

const deptCountStyle: CSSProperties = {
  minWidth: 88,
  textAlign: 'right',
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 12,
  color: '#0f2744',
  fontVariantNumeric: 'tabular-nums',
}

const topBuildingRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  width: '100%',
  padding: '9px 18px',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid #f0ede5',
  cursor: 'pointer',
  textAlign: 'left',
}

const topBuildingCountsStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#666',
}
