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
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    fetch('/api/latest-complaint')
      .then((r) => r.json())
      .then((data) => {
        if (data.timestamp) setTimestamp(formatDateTime(data.timestamp))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const showInline = open || hover

  return (
    <span
      ref={wrapRef}
      className="group relative inline"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-[#6b6b6b] underline decoration-dashed decoration-from-font underline-offset-2 hover:text-[#3d3d3d] focus:outline-none focus:ring-2 focus:ring-[#0a4080] focus:ring-offset-1 focus:ring-offset-[#f0f0ed] rounded"
        aria-expanded={open}
        aria-label="Show when this data was last updated"
      >
        live 311 data
      </button>
      {showInline && (
        <>
          <br />
          <span
            className="block text-center"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
            aria-hidden={false}
          >
            <span className="text-[#6b6b6b]">(last updated </span>
            {timestamp ? (
              <span className="text-green-600 font-mono text-[0.925em] font-medium tracking-tight">
                {timestamp}
              </span>
            ) : (
              <span className="text-[#6b6b6b]">—</span>
            )}
            <span className="text-[#6b6b6b]"> CT)</span>
          </span>
        </>
      )}
      <br />
    </span>
  )
}
