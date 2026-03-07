'use client'

import { useEffect, useState } from 'react'

function formatDateTime(isoLike: string): string {
  // Socrata stores Chicago local time — strip any timezone offset before parsing
  const clean = isoLike.slice(0, 19) // "2026-03-07T11:16:58"
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

  return fmt.format(d).replace(' AM', 'am').replace(' PM', 'pm') + ' CT'
}

export default function LiveTimestamp() {
  const [timestamp, setTimestamp] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/latest-complaint')
      .then((r) => r.json())
      .then((data) => {
        if (data.timestamp) setTimestamp(formatDateTime(data.timestamp))
      })
      .catch(() => {})
  }, [])

  if (!timestamp) return null

  return (
    <>
      <style>{`
        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .live-timestamp {
          animation: pulse-green 6s ease-in-out infinite;
          color: #22c55e;
          font-family: 'Fira Code', 'JetBrains Mono', 'Cascadia Code', 'Consolas', 'Courier New', monospace;
          font-size: .925em;
          font-weight: 500;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
      `}</style>
      <span style={{ whiteSpace: 'nowrap' }}>as of <span className="live-timestamp">{timestamp}</span></span>
    </>
  )
}