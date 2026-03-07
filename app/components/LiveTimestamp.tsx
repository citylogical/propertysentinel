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

  const showTooltip = open

  return (
    <span ref={wrapRef} className="group relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-[#3d3d3d] underline decoration-dotted decoration-from-font underline-offset-2 hover:text-[#1a1a1a] hover:decoration-solid focus:outline-none focus:ring-2 focus:ring-[#0a4080] focus:ring-offset-1 focus:ring-offset-[#f0f0ed] rounded"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Show when this data was last updated"
      >
        live 311 data
      </button>

      <span
        className={`absolute left-1/2 bottom-full -translate-x-1/2 mb-2 px-3 py-2 w-[max(240px,100%)] max-w-[320px] text-left text-sm font-normal text-[#1a1a1a] bg-white border border-[#d4cfc4] rounded shadow-lg z-50 whitespace-normal pointer-events-none transition-[opacity,visibility] duration-150 ${
          showTooltip ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'
        }`}
        role="tooltip"
      >
        Data pulled from Chicago Open Data Portal — last updated{' '}
        {timestamp ? (
          <span className="text-green-600 font-mono text-[0.925em] font-medium tracking-tight whitespace-nowrap">
            {timestamp} CT
          </span>
        ) : (
          <span className="text-[#6b6b6b]">—</span>
        )}
      </span>
    </span>
  )
}
