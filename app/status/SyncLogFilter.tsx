'use client'

import { useState } from 'react'

type RunRow = {
  id: string
  ran_at: string
  status: 'success' | 'no_new_records' | 'failure'
  records_fetched: number
  error_message: string | null
  duration_ms: number | null
  lag_seconds: number | null
  min_modified: string | null
  max_modified: string | null
  source: string
}

const WINDOWS = [
  { label: 'Last 6 hours', hours: 6 },
  { label: 'Last 12 hours', hours: 12 },
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 48 hours', hours: 48 },
]

// Formatters duplicated from page.tsx — this is a client component and can't
// import the server file's local helpers. Kept byte-identical for parity.
function formatCT(isoStr: string | null | undefined) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}

function formatLag(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

function formatModifiedRange(minTs: string, maxTs: string): string {
  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
  }
  const minTime = new Intl.DateTimeFormat('en-US', timeOpts).format(new Date(minTs))
  const maxTime = new Intl.DateTimeFormat('en-US', timeOpts).format(new Date(maxTs))
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'numeric', day: 'numeric', year: '2-digit',
  }).format(new Date(minTs))
  return `Fetched records from ${minTime}–${maxTime} ${dateStr}`
}

function truncateError(msg: string | null): string | null {
  if (!msg) return null
  const clean = msg.replace(/for url: https?:\/\/\S+/gi, '').trim()
  return clean.length > 120 ? clean.slice(0, 120) + '…' : clean
}

export default function SyncLogFilter({ runs }: { runs: RunRow[] }) {
  const [hours, setHours] = useState(6)
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  const filtered = runs.filter(r => new Date(r.ran_at).getTime() >= cutoff)

  return (
    <div className="status-synclog" style={{ background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6, overflow: 'hidden', marginBottom: 32 }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #ddd9d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8a94a0' }}>
          Recent Sync Log
        </span>
        <select
          value={hours}
          onChange={e => setHours(Number(e.target.value))}
          style={{
            fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568',
            background: '#fafaf8', border: '1px solid #ddd9d0', borderRadius: 4,
            padding: '3px 8px', cursor: 'pointer',
          }}
        >
          {WINDOWS.map(w => (
            <option key={w.hours} value={w.hours}>{w.label}</option>
          ))}
        </select>
      </div>
      <div className="status-synclog-headrow" style={{ padding: '8px 20px', background: '#fafaf8', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '180px 80px 70px 70px 1fr', gap: 12 }}>
        {['Time (CT)', 'Status', 'Records', 'Lag', 'Details'].map(h => (
          <span key={h} style={{ fontFamily: '"DM Mono", monospace', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8a94a0' }}>{h}</span>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: '#8a94a0' }}>
          No runs in the selected window.
        </div>
      ) : filtered.map(run => {
        const statusStyle = run.status === 'success'
          ? { background: 'rgba(45,106,79,0.1)', color: '#2d6a4f' }
          : run.status === 'failure'
          ? { background: 'rgba(192,57,43,0.08)', color: '#c0392b' }
          : { background: '#f0f0ed', color: '#8a94a0' }
        const statusLabel = run.status === 'success' ? 'Success'
          : run.status === 'failure' ? 'Failed' : 'No new'
        const details = run.status === 'success' && run.min_modified && run.max_modified
          ? formatModifiedRange(run.min_modified, run.max_modified)
          : run.status === 'failure'
          ? (truncateError(run.error_message) ?? '503 — Socrata unavailable')
          : 'No records fetched'
        const lagDisplay = run.lag_seconds != null ? formatLag(run.lag_seconds) : '—'
        return (
          <div key={run.id} className="status-synclog-row" style={{ padding: '9px 20px', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '180px 80px 70px 70px 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: '#8a94a0' }}>{formatCT(run.ran_at)}</div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, fontWeight: 500, padding: '2px 7px', borderRadius: 3, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block', ...statusStyle }}>
              {statusLabel}
            </div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568' }}>
              {run.records_fetched > 0 ? run.records_fetched.toLocaleString() : '—'}
            </div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568' }}>{lagDisplay}</div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: '#8a94a0' }}>{details}</div>
          </div>
        )
      })}
      <style>{`
        @media (max-width: 640px) {
          .status-synclog-headrow,
          .status-synclog-row {
            grid-template-columns: 88px 64px 1fr !important;
            gap: 8px !important;
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
          /* Hide the Records and Details columns on mobile — keep Time, Status, Lag */
          .status-synclog-headrow > *:nth-child(3),
          .status-synclog-headrow > *:nth-child(5),
          .status-synclog-row > *:nth-child(3),
          .status-synclog-row > *:nth-child(5) {
            display: none !important;
          }
          .status-synclog-row {
            padding-top: 12px !important;
            padding-bottom: 12px !important;
          }
        }
      `}</style>
    </div>
  )
}
