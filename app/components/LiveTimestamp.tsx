'use client'

import { useEffect, useState, useRef } from 'react'

function formatDateTime(isoLike: string): string {
  const clean = isoLike.slice(0, 19)
  const d = new Date(clean)
  if (Number.isNaN(d.getTime())) return ''

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return fmt.format(d).replace(' AM', 'am').replace(' PM', 'pm')
}

export default function LiveTimestamp() {
  const [timestamp, setTimestamp] = useState<string | null>(null)
  const [statusData, setStatusData] = useState<{ status: 'operational' | 'degraded'; lastRanAt: string | null } | null>(null)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/latest-complaint')
      .then((r) => r.json())
      .then((data) => {
        if (data.timestamp) setTimestamp(formatDateTime(data.timestamp))
      })
      .catch(() => {})

    fetch('/api/status-summary')
      .then((r) => r.json())
      .then((data) => setStatusData(data))
      .catch(() => setStatusData({ status: 'operational', lastRanAt: null }))
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const showPopover = open || hover
  const isOperational = !statusData || statusData.status !== 'degraded'

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline', zIndex: 1000 }}
      onMouseEnter={() => {
        if (leaveTimer.current) clearTimeout(leaveTimer.current)
        setHover(true)
      }}
      onMouseLeave={() => {
        leaveTimer.current = setTimeout(() => setHover(false), 1500)
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          cursor: 'pointer',
          border: 0,
          background: 'transparent',
          padding: 0,
          font: 'inherit',
          color: '#6b6b6b',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: '3px',
          fontSize: 'inherit',
        }}
        aria-expanded={open}
        aria-label="Show data status"
      >
        live 311 data
      </button>

      {showPopover && (
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 10px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: '#ffffff',
            border: '1px solid #ddd9d0',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,51,102,0.12)',
            padding: '12px 16px',
            minWidth: 240,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            animation: 'popoverIn 0.18s ease-out',
            whiteSpace: 'nowrap',
          }}
          role="status"
        >
          {/* Line 1: Last updated */}
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568' }}>
            Last updated:{' '}
            {statusData?.lastRanAt
              ? <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{formatDateTime(statusData.lastRanAt)} CT</span>
              : timestamp
              ? <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{timestamp} CT</span>
              : <span style={{ color: '#8a94a0' }}>—</span>
            }
          </span>

          {/* Line 2: Status */}
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568', display: 'flex', alignItems: 'center', gap: 6 }}>
            Status:{' '}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              color: isOperational ? '#2d6a4f' : '#c0392b',
              fontWeight: 500,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'currentColor', flexShrink: 0,
                animation: 'statusPulse 2s infinite',
              }} />
              {isOperational ? 'Operational' : 'Degraded'}
            </span>
          </span>

          {/* Line 3: Link */}
          <a
            href="/status"
            style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: 11,
              color: '#0a4080',
              textDecoration: 'none',
              marginTop: 2,
            }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            See full status →
          </a>
        </span>
      )}

      <style>{`
        @keyframes popoverIn {
          from { opacity: 0; transform: translateX(-50%) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </span>
  )
}