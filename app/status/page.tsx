// app/status/page.tsx
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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

type Incident = RunRow & { isResolved: boolean }

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

// Convert a Socrata CT-local timestamp to true UTC ms for lag calculation.
function socrataToTrueUTCMs(socrataStr: string): number {
  const clean = socrataStr.slice(0, 19)
  const month = parseInt(clean.slice(5, 7))
  const day = parseInt(clean.slice(8, 10))
  // CDT (UTC-5): second Sunday in March through first Sunday in November
  const isCDT = (month > 3 && month < 11) || (month === 3 && day >= 8)
  const offsetMs = (isCDT ? 5 : 6) * 3600 * 1000
  return new Date(clean + 'Z').getTime() + offsetMs
}

function computeLagSeconds(socrataLastModified: string, ranAt: string): number | null {
  try {
    const lagMs = new Date(ranAt).getTime() - socrataToTrueUTCMs(socrataLastModified)
    const secs = Math.round(lagMs / 1000)
    if (secs < 0 || secs > 86400) return null
    return secs
  } catch {
    return null
  }
}

function formatCT(isoStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoStr))
}

function formatDateCT(isoStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoStr))
}

function formatTimeCT(isoStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoStr))
}

function getDayCT(isoStr: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoStr))
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

function buildDaySummaries(runs: RunRow[]): DaySummary[] {
  const days: DaySummary[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({ date: getDayCT(d.toISOString()), total: 0, failures: 0, status: 'no_data' })
  }
  for (const run of runs) {
    const entry = days.find(d => d.date === getDayCT(run.ran_at))
    if (!entry) continue
    entry.total++
    if (run.status === 'failure') entry.failures++
  }
  for (const entry of days) {
    if (entry.total === 0) entry.status = 'no_data'
    else if (entry.failures === 0) entry.status = 'success'
    else if (entry.failures < entry.total) entry.status = 'partial'
    else entry.status = 'failure'
  }
  return days
}

export default async function StatusPage() {
  const supabase = getSupabaseAdmin()

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  async function fetchRuns() {
    return supabase
      .from('worker_a_runs')
      .select('*')
      .gte('ran_at', ninetyDaysAgo.toISOString())
      .order('ran_at', { ascending: false })
      .limit(2000)
  }

  async function fetchLatestMod() {
    return supabase
      .from('complaints_311')
      .select('last_modified_date')
      .order('last_modified_date', { ascending: false })
      .limit(1)
      .single()
  }

  const [runsResult, latestModResult] = await Promise.all([fetchRuns(), fetchLatestMod()])

  const allRuns: RunRow[] = runsResult.data ?? []
  const lastModifiedStr: string | null = latestModResult.data?.last_modified_date ?? null

  // Stats
  const totalRuns = allRuns.length
  const failedRuns = allRuns.filter(r => r.status === 'failure').length
  const uptimePct = totalRuns > 0
    ? (((totalRuns - failedRuns) / totalRuns) * 100).toFixed(1)
    : '100.0'

  const lastSuccessRun = allRuns.find(r => r.status === 'success' || r.status === 'no_new_records')
  const totalRecords = allRuns.reduce((sum, r) => sum + (r.records_fetched ?? 0), 0)

  // Compute current lag fresh from complaints_311 MAX(last_modified_date)
  const currentLag = lastModifiedStr && lastSuccessRun
    ? computeLagSeconds(lastModifiedStr, lastSuccessRun.ran_at)
    : null

  // Average lag: exclude only corrupted log_import rows (which have NULL lag anyway).
  // Includes both success and no_new_records runs — NO NEW lag reflects real staleness.
  const runsWithLag = allRuns.filter(
    r => r.lag_seconds != null && r.source !== 'log_import'
  )
  const avgLagSeconds = runsWithLag.length > 0
    ? Math.round(runsWithLag.reduce((s, r) => s + r.lag_seconds!, 0) / runsWithLag.length)
    : null

  const isCurrentlyOperational = !allRuns[0] || allRuns[0].status !== 'failure'

  const daySummaries = buildDaySummaries([...allRuns].reverse())

  const incidents: Incident[] = allRuns
    .filter(r => r.status === 'failure')
    .map(inc => ({
      ...inc,
      isResolved: allRuns.some(
        r => (r.status === 'success' || r.status === 'no_new_records') && r.ran_at > inc.ran_at
      ),
    }))

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const recentRuns = allRuns.filter(r => r.ran_at >= oneDayAgo)

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
        {lastModifiedStr && lastSuccessRun && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 20,
            padding: '10px 16px', marginBottom: 24,
            background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6,
            fontFamily: '"DM Mono", monospace', fontSize: 11,
          }}>
            <span style={{ color: '#8a94a0', letterSpacing: '0.04em' }}>
              Latest:{' '}
              <span style={{ color: '#1a1a1a' }}>
                {formatSocrataTimeCT(lastModifiedStr)} CT
              </span>
            </span>
            {currentLag != null && (
              <>
                <span style={{ color: '#ddd9d0' }}>·</span>
                <span style={{ color: '#8a94a0' }}>
                  Synced{' '}
                  <span style={{ color: '#2d6a4f' }}>{formatLag(currentLag)} after modification</span>
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
              sub: `${failedRuns} incident${failedRuns !== 1 ? 's' : ''}`,
              color: '#2d6a4f',
            },
            {
              label: 'Last Sync',
              value: lastSuccessRun ? formatTimeCT(lastSuccessRun.ran_at) : '—',
              sub: lastSuccessRun ? formatDateCT(lastSuccessRun.ran_at) : '—',
              color: '#1a1a1a',
            },
            {
              label: 'Records (90d)',
              value: totalRecords.toLocaleString(),
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
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #ddd9d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>
              Incident History
            </span>
            <span style={{ fontSize: 11, color: '#8a94a0' }}>All times CT</span>
          </div>
          {incidents.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: '#8a94a0' }}>
              No incidents in the last 90 days.
            </div>
          ) : incidents.map(inc => (
            <div key={inc.id} style={{ padding: '14px 20px', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 16, alignItems: 'start' }}>
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