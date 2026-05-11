'use client'

import { useState } from 'react'
import type { PortfolioSummaryData } from './PortfolioSummaryModal'

type Props = {
  data: PortfolioSummaryData | null
  loading: boolean
  onOpenSummary: () => void
}

function formatAge(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (diff < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PortfolioSummaryBanner({ data, loading, onOpenSummary }: Props) {
  const [hover, setHover] = useState(false)

  const totalBuildings = data?.headline.total_buildings ?? 0
  const totalUnits = data?.headline.total_units ?? 0
  const openComplaints = data?.open.building_complaints ?? 0
  const weekComplaints = data?.this_week.complaints_building ?? 0
  const mostRecent = data?.banner.most_recent_building_complaint?.date ?? null

  return (
    <div
      onClick={onOpenSummary}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenSummary()
        }
      }}
      role="button"
      tabIndex={0}
      style={{
        cursor: 'pointer',
        transition: 'transform 180ms ease, box-shadow 180ms ease, background 180ms ease',
        transform: hover ? 'scale(1.005)' : 'scale(1)',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.12)' : '0 0 0 rgba(0,0,0,0)',
        background: hover ? '#2a4569' : '#243f5e',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        padding: '8px 14px',
        minWidth: 0,
        borderRadius: 6,
      }}
    >
      {/* Left: small bldgs · units inline pair */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          flexShrink: 0,
          paddingRight: 14,
          borderRight: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '—' : `${totalBuildings.toLocaleString()} · ${totalUnits.toLocaleString()}`}
        </div>
        <div
          style={{
            fontSize: 8,
            color: 'rgba(255,255,255,0.55)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}
        >
          bldgs · units
        </div>
      </div>

      {/* Right: three hero-sized urgent stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 18,
          flex: '0 0 auto',
          minWidth: 0,
        }}
      >
        <HeroStat
          value={loading ? '—' : openComplaints.toLocaleString()}
          label="open"
          color="#d4a418"
        />
        <HeroStat
          value={loading ? '—' : weekComplaints.toLocaleString()}
          label="this week"
          color="#e85d4a"
        />
        <HeroStat
          value={loading ? '—' : formatAge(mostRecent)}
          label="latest"
          color="#e85d4a"
        />
      </div>
    </div>
  )
}

function HeroStat({
  value,
  label,
  color,
}: {
  value: string
  label: string
  color: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        minWidth: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 18,
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 8,
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </div>
  )
}
