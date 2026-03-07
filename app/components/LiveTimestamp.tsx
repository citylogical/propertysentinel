'use client'

import { useEffect, useState } from 'react'

function formatDateTime(isoLike: string): string {
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const hour = d.getHours()
  const min = d.getMinutes()
  const minStr = min === 0 ? '' : `:${String(min).padStart(2, '0')}`
  const h12 = hour === 0 || hour === 12 ? 12 : hour % 12
  const ampm = hour < 12 ? 'am' : 'pm'
  return `${date} ${h12}${minStr}${ampm}`
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
          50% { opacity: 0.4; }
        }
        .live-timestamp {
          animation: pulse-green 2.5s ease-in-out infinite;
          color: #22c55e;
          font-weight: 600;
          white-space: nowrap;
        }
      `}</style>
      <span className="live-timestamp">last updated {timestamp}</span>
    </>
  )
}