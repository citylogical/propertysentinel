'use client'

import { useEffect, useState, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

type StatusData = {
  status: 'operational' | 'degraded'
  lastRanAt: string | null
}

export default function LiveTimestamp() {
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    fetch('/api/status-summary')
      .then((r) => r.json())
      .then((data) => setStatusData(data))
      .catch(() => setStatusData({ status: 'operational', lastRanAt: null }))
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const showPopover = open || hover
  const isOperational = !statusData || statusData.status !== 'degraded'

  const recordTime = statusData?.lastRanAt
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
        .format(new Date(statusData.lastRanAt))
        .replace(' AM', 'am')
        .replace(' PM', 'pm')
    : null

  const desktopPopoverStyle: CSSProperties = {
    position: 'absolute',
    bottom: 'calc(100% + 10px)',
    left: '50%',
    transformOrigin: 'bottom center',
    zIndex: 1000,
    background: '#ffffff',
    border: '1px solid #ddd9d0',
    borderRadius: 6,
    boxSizing: 'border-box',
    padding: '14px 16px 0',
    minWidth: 220,
    maxWidth: 280,
    width: 'max-content',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    alignItems: 'stretch',
    overflow: 'hidden',
    textAlign: 'center',
    animation: 'popoverIn 220ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
  }

  /** No position/transform/zIndex — `globals.css` @media (max-width: 768px) `.status-popover` handles layout when portaled to `document.body`. */
  const mobilePopoverStyle: CSSProperties = {
    background: '#ffffff',
    border: '1px solid #ddd9d0',
    borderRadius: 6,
    boxSizing: 'border-box',
    padding: '14px 16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    alignItems: 'stretch',
    overflow: 'hidden',
    textAlign: 'center',
  }

  const popoverBody = (
    <>
      <span
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          fontFamily: '"DM Mono", monospace',
          fontSize: 14,
          fontWeight: 600,
          color: isOperational ? '#2d6a4f' : '#c0392b',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'currentColor',
            flexShrink: 0,
            animation: 'statusPulse 2s infinite',
          }}
        />
        {isOperational ? 'Operational' : 'Degraded'}
      </span>

      <span
        style={{
          marginTop: 6,
          marginBottom: 14,
          fontFamily: '"DM Mono", monospace',
          fontSize: 11,
          color: '#4a5568',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        Last Sync:{' '}
        {recordTime ? (
          <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{recordTime} CT</span>
        ) : (
          <span style={{ color: '#8a94a0' }}>—</span>
        )}
      </span>

      <span
        style={{
          margin: '0 -16px',
          width: 'calc(100% + 32px)',
          height: 0,
          border: 0,
          borderTop: '1px solid #ddd9d0',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
        role="separator"
      />

      <a
        href="/status"
        style={{
          display: 'block',
          width: 'calc(100% + 32px)',
          boxSizing: 'border-box',
          margin: '0 -16px',
          padding: '9px 0',
          background: '#003366',
          color: '#ffffff',
          fontFamily: '"DM Mono", monospace',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          textAlign: 'center',
          textDecoration: 'none',
          borderRadius: '0 0 6px 6px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#0a4080'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#003366'
        }}
      >
        See uptime stats
      </a>
    </>
  )

  const mobilePopoverEl =
    mounted && isMobile && showPopover ? (
      <div ref={popoverRef} className="status-popover" style={mobilePopoverStyle} role="status">
        {popoverBody}
      </div>
    ) : null

  return (
    <>
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

        {showPopover && !isMobile ? (
          <span className="status-popover" style={desktopPopoverStyle} role="status">
            {popoverBody}
          </span>
        ) : null}

        <style>{`
        @keyframes popoverIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px) scaleY(0.92);
            box-shadow: 0 2px 8px rgba(0, 51, 102, 0.08);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scaleY(1);
            box-shadow: 0 4px 16px rgba(0, 51, 102, 0.12);
          }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
      </span>
      {mobilePopoverEl ? createPortal(mobilePopoverEl, document.body) : null}
    </>
  )
}
