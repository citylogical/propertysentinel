// app/status/page.tsx
import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

export const metadata: Metadata = {
  title: 'Chicago 311 Data Status — Property Sentinel',
  description:
    'Live sync status for the Chicago Open Data Portal 311 feed ingested by Property Sentinel.',
  alternates: {
    canonical: '/status',
  },
}

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

type DaySummary = {
  date: string
  total: number
  failures: number
  status: 'success' | 'partial' | 'failure' | 'no_data'
}

type StatusPagePayload = {
  computed_at: string
  latest_sync: {
    ran_at: string
    records_fetched: number
    duration_ms: number | null
    max_modified: string | null
    lag_seconds: number | null
  } | null
  most_recent_run_status: 'success' | 'no_new_records' | 'failure' | null
  complaint_count_90d: number
  avg_lag_seconds: number | null
  uptime_pct: number
  daily_history: Array<{
    run_date: string
    run_count: number
    success_count: number
    failure_count: number
  }>
  incidents: Array<{
    ran_at: string
    status: string
    error_message: string | null
    is_ongoing: boolean
  }>
  recent_runs: RunRow[]
  latest_complaint_modified: string | null
  current_lag_seconds: number | null
}

type StatusPageData = StatusPagePayload & { cache_computed_at: string }

const getStatusData = unstable_cache(
  async (): Promise<StatusPageData> => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data, error } = await sb
      .from('status_page_cache')
      .select('payload, computed_at')
      .eq('id', 1)
      .single()
    if (error || !data) throw new Error('status cache unavailable')
    const payload = data.payload as StatusPagePayload
    return { ...payload, cache_computed_at: data.computed_at }
  },
  ['status-page-data'],
  { revalidate: 300, tags: ['status'] }
)

// Socrata stores Chicago local time but Supabase appends +00:00 (false UTC marker).
// The stored value IS the CT local time. To display it correctly, format with timeZone: 'UTC'.
function formatSocrataTimeCT(socrataStr: string): string {
  const clean = socrataStr.slice(0, 19)
  const d = new Date(clean + 'Z')
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

function formatCT(isoStr: string | null | undefined) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

function formatDateCT(isoStr: string | null | undefined) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

function formatTimeCT(isoStr: string | null | undefined) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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

// Format a min/max modified range as "Fetched records from 17:45–18:30 3/25/26".
// Both timestamps are stored as CT local time with false +00:00 UTC marker —
// display with timeZone: 'UTC' to show the stored value as-is.
function formatModifiedRange(minTs: string, maxTs: string): string {
  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }
  const minTime = new Intl.DateTimeFormat('en-US', timeOpts).format(new Date(minTs))
  const maxTime = new Intl.DateTimeFormat('en-US', timeOpts).format(new Date(maxTs))
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  }).format(new Date(minTs))
  return `Fetched records from ${minTime}–${maxTime} ${dateStr}`
}

function truncateError(msg: string | null): string | null {
  if (!msg) return null
  const clean = msg.replace(/for url: https?:\/\/\S+/gi, '').trim()
  return clean.length > 120 ? clean.slice(0, 120) + '…' : clean
}

function daySummaryFromDailyHistory(row: StatusPagePayload['daily_history'][number]): DaySummary {
  const total = row.run_count
  const failures = row.failure_count
  let status: DaySummary['status']
  if (total === 0) status = 'no_data'
  else if (failures === 0) status = 'success'
  else if (failures < total) status = 'partial'
  else status = 'failure'
  return { date: row.run_date, total, failures, status }
}

export default async function StatusPage() {
  const data = await getStatusData()

  const uptimePct = Number(data.uptime_pct).toFixed(1)
  const failedRunsCount = data.daily_history.reduce((s, d) => s + d.failure_count, 0)

  const lastSuccessRunAt = data.latest_sync?.ran_at ?? null

  const avgLagSeconds =
    data.avg_lag_seconds != null && Number.isFinite(data.avg_lag_seconds)
      ? Math.round(data.avg_lag_seconds)
      : null

  const daySummaries = data.daily_history.map(daySummaryFromDailyHistory)

  const incidents = data.incidents.map(inc => ({
    ...inc,
    isResolved: !inc.is_ongoing,
  }))

  const isCurrentlyOperational =
    data.most_recent_run_status === 'success' ||
    data.most_recent_run_status === 'no_new_records'

  const recentRuns = data.recent_runs ?? []

  const lastModifiedStr = data.latest_complaint_modified
  const currentLag =
    data.current_lag_seconds != null && Number.isFinite(data.current_lag_seconds)
      ? Math.round(data.current_lag_seconds)
      : null
  const syncLag =
    data.latest_sync?.lag_seconds != null && Number.isFinite(data.latest_sync.lag_seconds)
      ? Math.round(data.latest_sync.lag_seconds)
      : null

  const barColor = (s: DaySummary['status']) => {
    if (s === 'success') return '#2d6a4f'
    if (s === 'partial') return '#b7791f'
    if (s === 'failure') return '#c0392b'
    return '#e8e4dc'
  }

  const barHeight = (s: DaySummary['status']) => {
    if (s === 'success') return 36
    if (s === 'partial') return 20
    if (s === 'failure') return 10
    return 4
  }

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content">
          <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', background: '#f0f0ed', minHeight: '100vh', color: '#1a1a1a' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, gap: 24 }}>
          <div>
            <h1 style={{ fontFamily: '"Merriweather", Georgia, serif', fontSize: 28, fontWeight: 700, color: '#001f3f', marginBottom: 8, letterSpacing: '-0.02em' }}>
              Chicago 311 Data Status
            </h1>
            <p style={{ fontSize: 13, color: '#8a94a0', lineHeight: 1.6, maxWidth: 520 }}>
              Live sync status for the Chicago Open Data Portal 311 feed. Property Sentinel ingests new complaints every 30 minutes.
            </p>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 4, flexShrink: 0,
            fontFamily: '"DM Mono", monospace', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.06em', textTransform: 'uppercase' as const,
            background: isCurrentlyOperational ? 'rgba(45,106,79,0.1)' : 'rgba(192,57,43,0.08)',
            border: `1px solid ${isCurrentlyOperational ? 'rgba(45,106,79,0.3)' : 'rgba(192,57,43,0.2)'}`,
            color: isCurrentlyOperational ? '#2d6a4f' : '#c0392b',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0,
              animation: 'statusPulse 2s infinite',
            }} />
            {isCurrentlyOperational ? 'Operational' : 'Degraded'}
          </div>
        </div>

        {/* Latest 311 record lag line */}
        {lastModifiedStr && lastSuccessRunAt && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 20,
            padding: '10px 16px', marginBottom: 24,
            background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6,
            fontFamily: '"DM Mono", monospace', fontSize: 11,
          }}>
            <span style={{ color: '#8a94a0', letterSpacing: '0.04em' }}>
              Most recent record:{' '}
              <span style={{ color: '#1a1a1a' }}>
                {formatSocrataTimeCT(lastModifiedStr)} CT
              </span>
            </span>
            {syncLag != null && (
              <>
                <span style={{ color: '#ddd9d0' }}>·</span>
                <span style={{ color: '#8a94a0' }}>
                  Current lag:{' '}
                  <span style={{ color: '#2d6a4f' }}>{formatLag(syncLag)}</span>
                </span>
              </>
            )}
          </div>
        )}

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            {
              label: 'Uptime (90 days)',
              value: `${uptimePct}%`,
              sub: `${failedRunsCount} incident${failedRunsCount !== 1 ? 's' : ''}`,
              color: '#2d6a4f',
            },
            {
              label: 'Last Sync',
              value: lastSuccessRunAt ? formatTimeCT(lastSuccessRunAt) : '—',
              sub: lastSuccessRunAt ? formatDateCT(lastSuccessRunAt) : '—',
              color: '#1a1a1a',
            },
            {
              label: 'Records (90d)',
              value: data.complaint_count_90d.toLocaleString(),
              sub: 'complaints synced',
              color: '#1a1a1a',
            },
            {
              label: 'Avg Lag Time',
              value: avgLagSeconds != null ? formatLag(avgLagSeconds) : '—',
              sub: avgLagSeconds != null ? 'modification → database' : 'accumulating…',
              color: avgLagSeconds != null ? '#2d6a4f' : '#8a94a0',
            },
          ].map(card => (
            <div key={card.label} style={{ background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6, padding: '14px 14px 12px' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#8a94a0', marginBottom: 8 }}>
                {card.label}
              </div>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 22, fontWeight: 500, color: card.color, lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 10, color: '#8a94a0', marginTop: 4 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* 90-day bar chart */}
        <div style={{ background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #ddd9d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>
              90-Day Sync History
            </span>
            <span style={{ fontSize: 11, color: '#8a94a0' }}>Each bar = one day</span>
          </div>
          <div style={{ padding: '20px 20px 14px' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 48, marginBottom: 8 }}>
              {daySummaries.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.total} runs, ${day.failures} failures`}
                  style={{
                    flex: 1,
                    height: barHeight(day.status),
                    background: barColor(day.status),
                    borderRadius: 2,
                    minHeight: 4,
                    cursor: 'pointer',
                    transition: 'opacity 0.1s',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {['90 days ago', '60 days ago', '30 days ago', 'Today'].map(l => (
                <span key={l} style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, color: '#8a94a0' }}>{l}</span>
              ))}
            </div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#2d6a4f', marginTop: 8 }}>
              {uptimePct}% uptime
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, padding: '10px 20px', borderTop: '1px solid #ddd9d0', background: '#fafaf8' }}>
            {[
              { color: '#2d6a4f', label: 'All syncs successful' },
              { color: '#b7791f', label: 'Partial outage' },
              { color: '#c0392b', label: 'Extended outage' },
              { color: '#e8e4dc', label: 'No data' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8a94a0' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* Incident log */}
        <div style={{ background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #ddd9d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 }}>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>
              Incident History
            </span>
            <span style={{ fontSize: 11, color: '#8a94a0' }}>
              All times CT · Status data refreshed: {formatCT(data.cache_computed_at)}
            </span>
          </div>
          {incidents.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: '#8a94a0' }}>
              No incidents in the last 90 days.
            </div>
          ) : incidents.map((inc, idx) => (
            <div key={`${inc.ran_at}-${idx}`} style={{ padding: '14px 20px', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 16, alignItems: 'start' }}>
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: '#8a94a0', paddingTop: 1, lineHeight: 1.5 }}>
                {formatCT(inc.ran_at)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', marginBottom: 3 }}>
                  Chicago Data Portal — 503 Service Unavailable
                </div>
                <div style={{ fontSize: 11, color: '#8a94a0', lineHeight: 1.5 }}>
                  {truncateError(inc.error_message) ?? 'Socrata API unavailable. Worker A exited gracefully. Resume cursor preserved — no records lost.'}
                </div>
              </div>
              <div style={{
                fontFamily: '"DM Mono", monospace', fontSize: 9, fontWeight: 500,
                padding: '2px 8px', borderRadius: 3, whiteSpace: 'nowrap' as const,
                textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                background: inc.isResolved ? 'rgba(45,106,79,0.1)' : 'rgba(192,57,43,0.08)',
                border: `1px solid ${inc.isResolved ? 'rgba(45,106,79,0.3)' : 'rgba(192,57,43,0.2)'}`,
                color: inc.isResolved ? '#2d6a4f' : '#c0392b',
              }}>
                {inc.isResolved ? 'Resolved' : 'Ongoing'}
              </div>
            </div>
          ))}
        </div>

        {/* Recent run log — last 24 hours */}
        <div style={{ background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6, overflow: 'hidden', marginBottom: 32 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #ddd9d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>
              Recent Sync Log
            </span>
            <span style={{ fontSize: 11, color: '#8a94a0' }}>Last 24 hours · All times CT</span>
          </div>
          <div style={{ padding: '8px 20px', background: '#fafaf8', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '180px 80px 70px 70px 1fr', gap: 12 }}>
            {['Time (CT)', 'Status', 'Records', 'Lag', 'Details'].map(h => (
              <span key={h} style={{ fontFamily: '"DM Mono", monospace', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>{h}</span>
            ))}
          </div>
          {recentRuns.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: '#8a94a0' }}>
              No runs in the last 24 hours.
            </div>
          ) : recentRuns.map(run => {
            const statusStyle = run.status === 'success'
              ? { background: 'rgba(45,106,79,0.1)', color: '#2d6a4f' }
              : run.status === 'failure'
              ? { background: 'rgba(192,57,43,0.08)', color: '#c0392b' }
              : { background: '#f0f0ed', color: '#8a94a0' }

            const statusLabel = run.status === 'success' ? 'Success'
              : run.status === 'failure' ? 'Failed'
              : 'No new'

            // Details column:
            // - SUCCESS with time range → "Fetched records from 17:45–18:30 3/25/26"
            // - FAILURE → truncated error message
            // - NO NEW → "No records fetched"
            const details = run.status === 'success' && run.min_modified && run.max_modified
              ? formatModifiedRange(run.min_modified, run.max_modified)
              : run.status === 'failure'
              ? (truncateError(run.error_message) ?? '503 — Socrata unavailable')
              : 'No records fetched'

            // Show lag for all runs where it's stored — no upper-bound filter.
            // log_import rows have NULL lag so they show '—' naturally.
            const lagDisplay = run.lag_seconds != null ? formatLag(run.lag_seconds) : '—'

            return (
              <div key={run.id} style={{ padding: '9px 20px', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '180px 80px 70px 70px 1fr', gap: 12, alignItems: 'center' }}>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: '#8a94a0' }}>
                  {formatCT(run.ran_at)}
                </div>
                <div style={{
                  fontFamily: '"DM Mono", monospace', fontSize: 9, fontWeight: 500,
                  padding: '2px 7px', borderRadius: 3, textAlign: 'center' as const,
                  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  display: 'inline-block', ...statusStyle,
                }}>
                  {statusLabel}
                </div>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568' }}>
                  {run.records_fetched > 0 ? run.records_fetched.toLocaleString() : '—'}
                </div>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#4a5568' }}>
                  {lagDisplay}
                </div>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: '#8a94a0' }}>
                  {details}
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 11, color: '#8a94a0', textAlign: 'center', lineHeight: 1.6 }}>
          Property Sentinel syncs Chicago 311 data every 30 minutes via the{' '}
          <a href="https://data.cityofchicago.org/resource/v6vf-nfxy.json" style={{ color: '#0a4080' }}>Chicago Open Data Portal</a>.{' '}
          Run history recorded from March 19, 2026. All times Central.
        </p>
      </div>

      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
          </div>
        </div>
      </div>
    </div>
  )
}
