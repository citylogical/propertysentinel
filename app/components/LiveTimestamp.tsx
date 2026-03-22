'use client'

import { useEffect, useState, useRef } from 'react'

// Socrata stores Chicago local time — display as-is by formatting with timeZone: 'UTC'
// The stored value IS the CT local time, so no conversion needed.
function formatSocrataTimeCT(raw: string): string {
  const clean = raw.slice(0, 19)
  const d = new Date(clean + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', // no conversion — value is already CT local
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d).replace(' AM', 'am').replace(' PM', 'pm')
}

type StatusData = {
  status: 'operational' | 'degraded'
  lastRanAt: string | null
  mostRecentModified: string | null
}

export default function LiveTimestamp() {
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/status-summary')
      .then((r) => r.json())
      .then((data) => setStatusData(data))
      .catch(() => setStatusData({ status: 'operational', lastRanAt: null, mostRecentModified: null }))
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

  const recordTime = statusData?.mostRecentModified
    ? formatSocrataTimeCT(statusData.mostRecentModified)
    : null

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
            minWidth: 260,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            animation: 'popoverIn 0.18s ease-out',
            whiteSpace: 'nowrap',
          }}
          role="status"
        >
          {/* Line 1: Most recent record */}
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568' }}>
            Most recent record:{' '}
            {recordTime
              ? <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{recordTime} CT</span>
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
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
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