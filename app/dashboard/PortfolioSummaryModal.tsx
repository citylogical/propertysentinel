'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type PortfolioSummaryData = {
  organization: string | null
  headline: {
    total_buildings: number
    total_units: number
    gross_monthly_rent: number
    occupancy_rate: number | null
    occupied_count: number
  }
  this_week: {
    complaints_total: number
    complaints_building: number
    violations_total: number
    stop_works: number
    permits_total: number
    most_recent_building: {
      sr_type: string
      date: string
      property_display: string
      standard_description: string | null
    } | null
  }
  open: {
    building_complaints: number
    buildings_with_open_complaints: number
    violations: number
    buildings_with_open_violations: number
    stop_work_count: number
  }
  banner: {
    most_recent_building_complaint:
      | { date: string; property_display: string; property_id: string }
      | null
    total_building_complaints_12mo: number
  }
  hottest_properties: Array<{
    id: string
    display: string
    community_area: string | null
    total_12mo: number
    open: number
  }>
  neighborhoods: Array<{ name: string; count: number }>
  status_breakdown: Record<string, number>
  tag_breakdown: Record<string, number>
}

type Props = {
  isOpen: boolean
  onClose: () => void
  /** When true, render a "Don't show again" checkbox. */
  showSuppressionOption: boolean
  onSuppressChange?: (suppressed: boolean) => void
  data: PortfolioSummaryData | null
  loading: boolean
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString()}`
}

function formatAge(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const days = Math.floor(diffMs / 86400000)
  const hours = Math.floor(diffMs / 3600000)
  if (diffMs < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PortfolioSummaryModal({
  isOpen,
  onClose,
  showSuppressionOption,
  onSuppressChange,
  data,
  loading,
}: Props) {
  const [violationsNoteOpen, setViolationsNoteOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) setViolationsNoteOpen(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  const orgName = data?.organization || 'Your portfolio'
  const today = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  )

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-modal-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#faf8f3',
          borderRadius: 8,
          width: '100%',
          maxWidth: 720,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 90px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid #ece8dd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: '#fff',
            borderRadius: '8px 8px 0 0',
          }}
        >
          <div>
            <div
              id="summary-modal-title"
              style={{
                fontFamily: 'Merriweather, Georgia, serif',
                fontSize: 20,
                fontWeight: 600,
                color: '#1a1a1a',
                lineHeight: 1.2,
              }}
            >
              {orgName} · Portfolio snapshot
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{today}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#666',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 28px' }}>
          {loading || !data ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 13 }}>
              Loading portfolio snapshot…
            </div>
          ) : (
            <>
              {/* Headline stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <HeadlineStat
                  value={data.headline.total_buildings.toLocaleString()}
                  label="buildings"
                  bg="#3a5577"
                  fg="#fff"
                  labelFg="rgba(255,255,255,0.7)"
                />
                <HeadlineStat
                  value={data.headline.total_units.toLocaleString()}
                  label="units"
                  bg="#3a5577"
                  fg="#fff"
                  labelFg="rgba(255,255,255,0.7)"
                />
                <HeadlineStat
                  value={formatCurrency(data.headline.gross_monthly_rent)}
                  label="gross monthly rent"
                  small
                  bg="#3e7d4e"
                  fg="#fff"
                  labelFg="rgba(255,255,255,0.75)"
                />
                <HeadlineStat
                  value={
                    data.headline.occupancy_rate != null
                      ? `${(data.headline.occupancy_rate * 100).toFixed(1)}%`
                      : '—'
                  }
                  label="occupied"
                  small
                  tooltip={
                    data.headline.occupancy_rate != null
                      ? `(Current + Notice-Rented) ÷ Total = ${data.headline.occupied_count} / ${data.headline.total_units}`
                      : 'Add units to see occupancy'
                  }
                  bg="#c89432"
                  fg="#fff"
                  labelFg="rgba(255,255,255,0.75)"
                />
              </div>

              {/* This Week */}
              <Section title="This week">
                <ul style={listStyle}>
                  <li>
                    <strong style={countStyle}>{data.this_week.complaints_total}</strong> new 311
                    complaint{data.this_week.complaints_total === 1 ? '' : 's'}
                    {data.this_week.complaints_building > 0 ? (
                      <span style={{ color: '#666' }}>
                        {' '}
                        ({data.this_week.complaints_building} building-related)
                      </span>
                    ) : null}
                  </li>
                  <li>
                    <strong style={countStyle}>{data.this_week.violations_total}</strong> new
                    violation{data.this_week.violations_total === 1 ? '' : 's'}
                    {data.this_week.stop_works > 0 ? (
                      <span style={{ color: '#b8302a', fontWeight: 600 }}>
                        {' '}
                        · {data.this_week.stop_works} stop-work
                      </span>
                    ) : (
                      <span style={{ color: '#666' }}> · 0 stop-work</span>
                    )}
                  </li>
                  <li>
                    <strong style={countStyle}>{data.this_week.permits_total}</strong> new permit
                    {data.this_week.permits_total === 1 ? '' : 's'}
                  </li>
                  {data.this_week.most_recent_building ? (
                    <li style={{ paddingTop: 6, color: '#444', lineHeight: 1.5 }}>
                      <div>
                        Most recent building complaint at{' '}
                        <span style={{ fontWeight: 500 }}>
                          {data.this_week.most_recent_building.property_display}
                        </span>
                        : <span style={{ fontWeight: 500 }}>{data.this_week.most_recent_building.sr_type}</span>{' '}
                        ·{' '}
                        <span
                          title={formatFullDate(data.this_week.most_recent_building.date)}
                          style={{ color: '#888', borderBottom: '1px dotted #c4c0b4', cursor: 'help' }}
                        >
                          {formatAge(data.this_week.most_recent_building.date)}
                        </span>
                      </div>
                      {data.this_week.most_recent_building.standard_description ? (
                        <div
                          style={{
                            marginTop: 4,
                            paddingLeft: 12,
                            borderLeft: '2px solid #ece8dd',
                            fontSize: 12,
                            color: '#666',
                            fontStyle: 'italic',
                            lineHeight: 1.5,
                          }}
                        >
                          {data.this_week.most_recent_building.standard_description}
                        </div>
                      ) : null}
                    </li>
                  ) : null}
                </ul>
              </Section>

              {/* Open Items */}
              <Section title="Open items">
                <ul style={listStyle}>
                  <li>
                    <strong style={countStyle}>{data.open.building_complaints}</strong> open building
                    complaint{data.open.building_complaints === 1 ? '' : 's'}{' '}
                    <span style={{ color: '#666' }}>
                      across {data.open.buildings_with_open_complaints} building
                      {data.open.buildings_with_open_complaints === 1 ? '' : 's'}
                    </span>
                  </li>
                  <li style={{ position: 'relative' }}>
                    <strong style={countStyle}>{data.open.violations}</strong>
                    <button
                      type="button"
                      onClick={() => setViolationsNoteOpen((v) => !v)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#c89432',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        marginRight: 4,
                        padding: 0,
                        verticalAlign: 'top',
                        lineHeight: 1,
                      }}
                      aria-label="About this number"
                    >
                      *
                    </button>{' '}
                    open violation
                    {data.open.violations === 1 ? '' : 's'}{' '}
                    <span style={{ color: '#666' }}>
                      across {data.open.buildings_with_open_violations} building
                      {data.open.buildings_with_open_violations === 1 ? '' : 's'}
                    </span>
                    {violationsNoteOpen ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: 4,
                          background: '#1a1a1a',
                          color: '#fff',
                          padding: '10px 12px',
                          borderRadius: 4,
                          fontSize: 12,
                          lineHeight: 1.5,
                          maxWidth: 420,
                          zIndex: 10,
                          boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
                        }}
                      >
                        Source: Chicago Dept. of Buildings violation database. The City routinely leaves
                        violations marked open even after resolution, especially when no follow-up
                        inspection is scheduled. Treat this number as a ceiling.
                        <button
                          type="button"
                          onClick={() => setViolationsNoteOpen(false)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            fontSize: 11,
                            marginTop: 6,
                            padding: 0,
                            textDecoration: 'underline',
                          }}
                        >
                          Got it
                        </button>
                      </div>
                    ) : null}
                  </li>
                  {data.open.stop_work_count > 0 ? (
                    <li>
                      <strong style={{ ...countStyle, color: '#b8302a' }}>
                        {data.open.stop_work_count}
                      </strong>{' '}
                      <span style={{ color: '#b8302a', fontWeight: 600 }}>
                        active stop-work order{data.open.stop_work_count === 1 ? '' : 's'}
                      </span>
                    </li>
                  ) : null}
                </ul>
              </Section>

              {/* Hottest Properties */}
              {data.hottest_properties.length > 0 ? (
                <Section title="Hottest properties · top 5 by building complaints">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {data.hottest_properties.map((p, idx) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f0ede5' }}>
                          <td
                            style={{
                              padding: '6px 8px 6px 0',
                              color: '#999',
                              width: 24,
                              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                              fontSize: 11,
                            }}
                          >
                            {idx + 1}.
                          </td>
                          <td style={{ padding: '6px 8px 6px 0', color: '#1a1a1a' }}>
                            {p.display}
                            {p.community_area ? (
                              <span style={{ color: '#888', marginLeft: 6, fontSize: 12 }}>
                                {p.community_area}
                              </span>
                            ) : null}
                          </td>
                          <td
                            style={{
                              padding: '6px 0',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                              fontSize: 12,
                              color: '#444',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {p.total_12mo} complaint{p.total_12mo === 1 ? '' : 's'}
                            {p.open > 0 ? (
                              <span style={{ color: '#b8302a', marginLeft: 6, fontWeight: 600 }}>
                                · {p.open} open
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              ) : null}

              {/* Neighborhoods — top 10 in table format */}
              {data.neighborhoods.length > 0 ? (
                <Section title="Properties by neighborhood · top 5">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {data.neighborhoods.slice(0, 5).map((n, idx) => (
                        <tr key={n.name} style={{ borderBottom: '1px solid #f0ede5' }}>
                          <td
                            style={{
                              padding: '6px 8px 6px 0',
                              color: '#999',
                              width: 24,
                              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                              fontSize: 11,
                            }}
                          >
                            {idx + 1}.
                          </td>
                          <td style={{ padding: '6px 8px 6px 0', color: '#1a1a1a' }}>{n.name}</td>
                          <td
                            style={{
                              padding: '6px 0',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                              fontSize: 12,
                              color: '#444',
                            }}
                          >
                            {n.count} {n.count === 1 ? 'property' : 'properties'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.neighborhoods.length > 5 ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                      + {data.neighborhoods.length - 5} more neighborhood
                      {data.neighborhoods.length - 5 === 1 ? '' : 's'}
                    </div>
                  ) : null}
                </Section>
              ) : null}

              {/* Status breakdown — table format */}
              {Object.keys(data.status_breakdown).length > 0 ? (
                <Section title="Unit status">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {Object.entries(data.status_breakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([status, count]) => (
                          <tr key={status} style={{ borderBottom: '1px solid #f0ede5' }}>
                            <td style={{ padding: '6px 8px 6px 0', color: '#1a1a1a' }}>{status}</td>
                            <td
                              style={{
                                padding: '6px 0',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                                fontSize: 12,
                                color: '#444',
                              }}
                            >
                              {count} {count === 1 ? 'unit' : 'units'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Section>
              ) : null}

              {/* Tags — colored bubble format */}
              {Object.keys(data.tag_breakdown).length > 0 ? (
                <Section title="Tags">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(data.tag_breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([tag, count]) => {
                        const palette = tagPalette(tag)
                        return (
                          <span
                            key={tag}
                            style={{
                              background: palette.bg,
                              color: palette.fg,
                              padding: '5px 10px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              border: `1px solid ${palette.border}`,
                            }}
                          >
                            <span>{tag}</span>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                                fontSize: 11,
                                color: palette.countFg,
                                fontWeight: 600,
                              }}
                            >
                              {count}
                            </span>
                          </span>
                        )
                      })}
                  </div>
                </Section>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 28px',
            borderTop: '1px solid #ece8dd',
            background: '#fff',
            borderRadius: '0 0 8px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {showSuppressionOption && onSuppressChange ? (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#666',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                onChange={(e) => onSuppressChange(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Don&apos;t show this again
            </label>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e3a5f',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Got it · view portfolio
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function tagPalette(tag: string): { bg: string; fg: string; countFg: string; border: string } {
  const upper = tag.toUpperCase()
  if (upper === 'FOR SALE') {
    return {
      bg: '#fcefe0',
      fg: '#a85b1f',
      countFg: '#a85b1f',
      border: '#f3cfa7',
    }
  }
  if (upper === 'OB') {
    return {
      bg: '#eee6f5',
      fg: '#5e3a8a',
      countFg: '#5e3a8a',
      border: '#d3c2e6',
    }
  }
  if (upper === 'PMA CANCELED') {
    return {
      bg: '#fce4ec',
      fg: '#9a2b59',
      countFg: '#9a2b59',
      border: '#f1c1d6',
    }
  }
  // fallback for any future user-created tag
  return {
    bg: '#eeece5',
    fg: '#555',
    countFg: '#777',
    border: '#d9d3c2',
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function HeadlineStat({
  value,
  label,
  small,
  tooltip,
  bg,
  fg,
  labelFg,
}: {
  value: string
  label: string
  small?: boolean
  tooltip?: string
  bg: string
  fg: string
  labelFg: string
}) {
  return (
    <div
      style={{
        background: bg,
        border: 'none',
        borderRadius: 6,
        padding: '16px 12px',
        textAlign: 'center',
      }}
      title={tooltip}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: small ? 22 : 32,
          fontWeight: 700,
          color: fg,
          lineHeight: 1.1,
          ...(tooltip ? { cursor: 'help', borderBottom: '1px dotted rgba(255,255,255,0.4)', display: 'inline-block' } : {}),
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: labelFg,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: 6,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.08em',
          color: '#888',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  fontSize: 13,
  color: '#1a1a1a',
  lineHeight: 2,
}

const countStyle: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 14,
  color: '#1a1a1a',
}
