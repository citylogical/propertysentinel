'use client'

import { useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

type EnrichmentHealthPayload = {
  enriched_24h: number
  enriched_1h: number
  last_enriched_at: string | null
  pending_enrichment: number
  healthy: boolean
}

function formatAgo(iso: string | null): string {
  if (!iso) return 'unknown'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'unknown'
  const sec = Math.max(0, (Date.now() - t) / 1000)
  if (sec < 60) return `${Math.floor(sec)} sec ago`
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`
  return `${Math.floor(sec / 86400)} days ago`
}

const POLL_MS = 5 * 60 * 1000

export default function EnrichmentHealthCheck() {
  const { user, isLoaded } = useUser()
  const isAdmin = (user?.publicMetadata as { role?: string } | undefined)?.role === 'admin'
  const [data, setData] = useState<EnrichmentHealthPayload | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (!isAdmin) return
    void fetch('/api/admin/enrichment-health', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EnrichmentHealthPayload | null) => {
        if (d && typeof d.healthy === 'boolean') setData(d)
        else setData(null)
      })
      .catch(() => setData(null))
  }, [isAdmin])

  useEffect(() => {
    if (!isLoaded || !isAdmin) return
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [isLoaded, isAdmin, load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!isLoaded || !isAdmin) return null

  const healthy = data == null ? true : data.healthy
  const lastAt = data?.last_enriched_at ?? null
  const title = healthy
    ? 'Enrichment healthy'
    : `Enrichment stale — last enriched: ${formatAgo(lastAt)}`

  return (
    <>
      <style>{`
        @keyframes enrichPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .enrich-health-pill--pulse .enrich-health-dot {
          animation: enrichPulse 2s infinite;
        }
      `}</style>
      <div
        ref={wrapRef}
        className="enrich-health-wrap"
        style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-start' }}
      >
        <button
          type="button"
          className={`enrich-health-pill address-page-enrich-pill ${
            healthy ? 'enrich-health-pill--ok' : 'enrich-health-pill--pulse'
          }`}
          title={title}
          aria-expanded={open}
          aria-label={title}
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            height: 28,
            minWidth: 32,
            padding: '0 8px',
            borderRadius: 4,
            border: '1px solid #d4c9b0',
            background: '#fff',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <span
            className="enrich-health-dot"
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: healthy ? '#166534' : '#b83232',
            }}
            aria-hidden
          />
          <span
            className="enrich-health-e"
            style={{
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              color: healthy ? '#166534' : '#b83232',
              lineHeight: 1,
            }}
          >
            E
          </span>
        </button>

        {open && !data ? (
          <div
            className="enrich-health-popover"
            role="status"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 6px)',
              zIndex: 100,
              minWidth: 200,
              padding: 12,
              background: '#fdfaf4',
              border: '1px solid #d4c9b0',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: 12,
              color: '#3a3128',
            }}
          >
            Loading…
          </div>
        ) : null}
        {open && data ? (
          <div
            className="enrich-health-popover"
            role="dialog"
            aria-label="311 enrichment health"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 6px)',
              zIndex: 100,
              minWidth: 200,
              padding: 12,
              background: '#fdfaf4',
              border: '1px solid #d4c9b0',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              fontFamily: '"DM Sans", system-ui, sans-serif',
            }}
          >
            <div style={{ fontSize: 12, color: '#3a3128', marginBottom: 8 }}>
              Last enriched: <strong style={{ fontWeight: 500 }}>{formatAgo(lastAt)}</strong>
            </div>
            <div
              style={{
                fontFamily: "var(--mono, 'DM Mono', monospace)",
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#7a6f62',
                marginBottom: 2,
              }}
            >
              Last 24h
            </div>
            <div style={{ fontSize: 12, color: '#3a3128', marginBottom: 8 }}>{data.enriched_24h} enriched</div>
            <div
              style={{
                fontFamily: "var(--mono, 'DM Mono', monospace)",
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#7a6f62',
                marginBottom: 2,
              }}
            >
              Last 1h
            </div>
            <div style={{ fontSize: 12, color: '#3a3128', marginBottom: 8 }}>{data.enriched_1h} enriched</div>
            <div
              style={{
                fontFamily: "var(--mono, 'DM Mono', monospace)",
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#7a6f62',
                marginBottom: 2,
              }}
            >
              Pending
            </div>
            <div style={{ fontSize: 12, color: '#3a3128', marginBottom: 10 }}>
              {data.pending_enrichment} complaints
            </div>
            <a
              href="https://311.chicago.gov/s/new-service-request"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: '#0f2744', fontWeight: 500 }}
            >
              Check fwuid →
            </a>
          </div>
        ) : null}
      </div>
    </>
  )
}
