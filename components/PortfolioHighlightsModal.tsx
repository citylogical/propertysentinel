'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import ComplaintDetail, { type ComplaintDetailRecord } from '@/app/dashboard/details/ComplaintDetail'
import { StatusPill, formatDate, type StatusKind } from '@/app/dashboard/details/_shared'

// One-time "your portfolio is live" recap: opens when PortfolioBuildDriver
// dispatches ps:portfolio-built, showing the 10 most recent activity events
// across the user's portfolio. Complaint rows drill into the same
// ComplaintDetail card used by the activity feed; violation/permit rows are
// display-only in v1.

type Category = 'complaint' | 'violation' | 'permit'

type ActivityRow = {
  category: Category
  id: string
  date: string
  open_date: string | null
  display_type: string
  status: 'open' | 'closed' | 'active' | 'expired' | null
  property_id: string
  property_address: string
  property_slug: string | null
  community_area: string | null
  complaint?: Record<string, unknown>
  violations?: unknown[]
  permit?: Record<string, unknown>
}

function categoryTag(cat: Category): string {
  return cat === 'violation' ? 'VIOL' : cat === 'permit' ? 'PERMIT' : '311'
}

function categoryTagColor(cat: Category): string {
  return cat === 'violation' ? '#c0392b' : cat === 'permit' ? '#6b7280' : '#0f2744'
}

function rowKey(row: ActivityRow): string {
  return `${row.category}:${row.id}`
}

export default function PortfolioHighlightsModal() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ActivityRow[]>([])
  const [selected, setSelected] = useState<ActivityRow | null>(null)

  useEffect(() => {
    const handler = () => {
      fetch('/api/dashboard/activity?range=12mo&limit=10&category=all&status=all')
        .then((r) => r.json())
        .then((data: { items?: ActivityRow[] }) => {
          const rows = data.items ?? []
          if (rows.length === 0) return
          setItems(rows)
          setSelected(null)
          setOpen(true)
        })
        .catch(() => {
          // Ambient recap — a failed fetch just means it doesn't show.
        })
    }
    window.addEventListener('ps:portfolio-built', handler)
    return () => window.removeEventListener('ps:portfolio-built', handler)
  }, [])

  const handleClose = () => {
    setOpen(false)
    setSelected(null)
  }

  if (!open) return null
  if (typeof window === 'undefined') return null

  return createPortal(
    <div className="save-modal-backdrop sq-backdrop" onClick={handleClose} role="presentation">
      <div
        className="sq-modal"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="portfolio-highlights-title"
        aria-modal="true"
      >
        <div style={headerStyle}>
          <div>
            <div id="portfolio-highlights-title" style={titleStyle}>
              Your portfolio is live
            </div>
            <div style={headerSubStyle}>
              The latest activity across your properties from the past 12 months.
            </div>
          </div>
          <button type="button" className="ir-close" onClick={handleClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div style={bodyStyle}>
          {selected ? (
            <div>
              <button type="button" style={backLinkStyle} onClick={() => setSelected(null)}>
                &larr; Back to highlights
              </button>
              <ComplaintDetail
                complaint={selected.complaint as ComplaintDetailRecord}
                isAdmin={false}
                address={selected.property_address}
                addressSlug={selected.property_slug}
              />
            </div>
          ) : (
            items.map((row) => {
              const clickable = row.category === 'complaint' && Boolean(row.complaint)
              const pillKind: StatusKind | null =
                row.status === 'open'
                  ? 'open'
                  : row.status === 'closed'
                    ? 'closed'
                    : row.status === 'active'
                      ? 'active'
                      : row.status === 'expired'
                        ? 'expired'
                        : null
              return (
                <div
                  key={rowKey(row)}
                  className={clickable ? 'phm-row phm-row-clickable' : 'phm-row'}
                  style={rowStyle}
                  onClick={clickable ? () => setSelected(row) : undefined}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  <div style={rowLeftStyle}>
                    {pillKind ? <StatusPill kind={pillKind} /> : null}
                    <span style={{ ...tagStyle, color: categoryTagColor(row.category) }}>
                      {categoryTag(row.category)}
                    </span>
                  </div>
                  <div style={rowMiddleStyle}>
                    <div style={rowTypeStyle}>{row.display_type}</div>
                    <div style={rowAddrStyle}>{row.property_address}</div>
                  </div>
                  <div style={rowDateStyle}>{formatDate(row.open_date)}</div>
                </div>
              )
            })
          )}
        </div>

        <div style={footerStyle}>
          <span style={footerLabelStyle}>SHOWING THE 10 MOST RECENT EVENTS</span>
          <button
            type="button"
            className="ps-cta ps-cta-green"
            onClick={() => {
              handleClose()
              window.location.assign('/dashboard/activity')
            }}
          >
            Go to activity feed
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const modalStyle: CSSProperties = {
  background: '#ffffff',
  borderRadius: 16,
  width: '100%',
  maxWidth: 640,
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 16px 48px rgba(15, 39, 68, 0.28)',
}

const headerStyle: CSSProperties = {
  background: '#ffffff',
  padding: '22px 26px 14px',
  borderBottom: '1px solid #e5e1d6',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  flexShrink: 0,
}

const titleStyle: CSSProperties = {
  fontFamily: 'Merriweather, Georgia, serif',
  fontSize: 22,
  fontWeight: 900,
  color: '#0f2744',
  lineHeight: 1.2,
}

const headerSubStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  color: '#4a5568',
  marginTop: 4,
}

const bodyStyle: CSSProperties = {
  overflowY: 'auto',
  flex: '1 1 auto',
}

const backLinkStyle: CSSProperties = {
  display: 'inline-block',
  background: 'none',
  border: 'none',
  padding: '14px 22px 0',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12.5,
  fontWeight: 600,
  color: '#0f2744',
  cursor: 'pointer',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 22px',
  borderBottom: '1px solid #eeeae1',
}

const rowLeftStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  flexShrink: 0,
  width: 64,
}

const tagStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.05em',
}

const rowMiddleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const rowTypeStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13.5,
  fontWeight: 600,
  color: '#1a1a1a',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const rowAddrStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 10.5,
  color: '#8a94a0',
  marginTop: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const rowDateStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  color: '#8a94a0',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 22px',
  background: '#f2f0eb',
  borderTop: '1px solid #e8e4dc',
  flexShrink: 0,
}

const footerLabelStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 11,
  letterSpacing: '0.05em',
  color: '#8a94a0',
}
