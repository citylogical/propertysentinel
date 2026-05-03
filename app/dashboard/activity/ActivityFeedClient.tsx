'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
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
}

const PAGE_SIZE = 50

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  if (row.category === 'permit') return 'active' // detail panel computes precise expiry
  if (row.status === 'open') return 'open'
  if (row.status === 'closed') return 'closed'
  return null
}

export default function ActivityFeedClient({ isAdmin = false }: Props) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasProperties, setHasProperties] = useState<boolean | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard/activity?limit=${PAGE_SIZE}&offset=${offset}`)
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
          setSelectedKey((prev) => {
            const items = data.items ?? []
            if (prev && items.some((r) => rowKey(r) === prev)) return prev
            return items[0] ? rowKey(items[0]) : null
          })
        }
      })
      .catch((e) => {
        setHasProperties(null)
        setError(String(e))
      })
      .finally(() => setLoading(false))
  }, [offset])

  const selectedRow = rows.find((r) => rowKey(r) === selectedKey) ?? null

  const headerTitle =
    selectedRow?.category === 'violation'
      ? 'Violation details'
      : selectedRow?.category === 'permit'
        ? 'Permit details'
        : 'Complaint details'

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
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'Merriweather, Georgia, serif',
              fontSize: 18,
              fontWeight: 600,
              color: '#1a1a1a',
              lineHeight: 1.2,
            }}
          >
            Activity Feed
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
            {loading ? 'Loading…' : `${total} events · last 12 months`}
          </div>
        </div>
        {totalPages > 1 ? (
          <div style={{ fontSize: 12, color: '#8a94a0' }}>
            Page {currentPage} of {totalPages}
          </div>
        ) : null}
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
          gridTemplateColumns: 'minmax(0, 1fr) 360px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ── List pane ─────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e1d6', minWidth: 0 }}>
          {/* Column headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '110px minmax(0, 1.6fr) 76px minmax(0, 2fr) 70px',
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
            <span>Date</span>
            <span>Address</span>
            <span>Category</span>
            <span>Type</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>

          {loading && rows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8a94a0', fontSize: 13 }}>
              Loading activity…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#8a94a0', fontSize: 13 }}>
              No activity in the last 12 months across your portfolio.
            </div>
          ) : (
            rows.map((row, idx) => {
              const key = rowKey(row)
              const isSelected = key === selectedKey
              const sk = statusKindFor(row)
              const propertyHref = row.property_slug
                ? `/address/${encodeURIComponent(row.property_slug)}`
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
                    gridTemplateColumns: '110px minmax(0, 1.6fr) 76px minmax(0, 2fr) 70px',
                    gap: 12,
                    padding: '10px 14px',
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
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontSize: 11,
                      color: '#888',
                    }}
                  >
                    {formatDate(row.date)}
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
                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {sk ? <StatusPill kind={sk} /> : null}
                  </span>
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

        {/* ── Detail pane ───────────────────────────────────────────── */}
        <div
          style={{
            position: 'sticky',
            top: 70,
            background: '#fff',
            border: '1px solid #e5e1d6',
            minHeight: 200,
          }}
        >
          {selectedRow ? (
            <div style={{ padding: '20px 24px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  color: panelPalette.headerText,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  background: panelPalette.headerBg,
                  padding: '8px 12px',
                  borderRadius: 4,
                  marginBottom: 12,
                }}
              >
                {headerTitle}
              </div>
              {selectedRow.property_slug ? (
                <Link
                  href={`/address/${encodeURIComponent(selectedRow.property_slug)}`}
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: '#5a7898',
                    textDecoration: 'none',
                    marginBottom: 14,
                    paddingBottom: 10,
                    borderBottom: '1px solid #f0ede6',
                  }}
                >
                  {selectedRow.property_address}
                  {selectedRow.community_area ? (
                    <span style={{ color: '#999', marginLeft: 6 }}>{selectedRow.community_area}</span>
                  ) : null}
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>→</span>
                </Link>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: '#5a7898',
                    marginBottom: 14,
                    paddingBottom: 10,
                    borderBottom: '1px solid #f0ede6',
                  }}
                >
                  {selectedRow.property_address}
                  {selectedRow.community_area ? (
                    <span style={{ color: '#999', marginLeft: 6 }}>{selectedRow.community_area}</span>
                  ) : null}
                </div>
              )}
              {selectedRow.category === 'complaint' && selectedRow.complaint ? (
                <ComplaintDetail complaint={selectedRow.complaint} isAdmin={isAdmin} />
              ) : selectedRow.category === 'violation' && selectedRow.violations ? (
                <ViolationDetail violations={selectedRow.violations} />
              ) : selectedRow.category === 'permit' && selectedRow.permit ? (
                <PermitDetail permit={selectedRow.permit} />
              ) : (
                <div style={{ fontSize: 13, color: '#8a94a0', fontStyle: 'italic' }}>
                  No details available.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: '40px 24px',
                textAlign: 'center',
                color: '#8a94a0',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              Select an item to see details.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
