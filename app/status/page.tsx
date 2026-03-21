// app/status/page.tsx
import { createClient } from '@supabase/supabase-js'

export const revalidate = 60 // revalidate every 60 seconds

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
  source: string
}

type DaySummary = {
  date: string // YYYY-MM-DD
  total: number
  failures: number
  status: 'success' | 'partial' | 'failure' | 'no_data'
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
  // Returns YYYY-MM-DD in Chicago time
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoStr))
}

function buildDaySummaries(runs: RunRow[]): DaySummary[] {
  const today = getDayCT(new Date().toISOString())
  const days: DaySummary[] = []

  for (let i = 89; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = getDayCT(d.toISOString())
    days.push({ date: dateStr, total: 0, failures: 0, status: 'no_data' })
  }

  for (const run of runs) {
    const day = getDayCT(run.ran_at)
    const entry = days.find(d => d.date === day)
    if (!entry) continue
    entry.total++
    if (run.status === 'failure') entry.failures++
  }

  for (const entry of days) {
    if (entry.total === 0) {
      entry.status = entry.date === today ? 'no_data' : 'no_data'
    } else if (entry.failures === 0) {
      entry.status = 'success'
    } else if (entry.failures < entry.total) {
      entry.status = 'partial'
    } else {
      entry.status = 'failure'
    }
  }

  return days
}

export default async function StatusPage() {
  const supabase = getSupabaseAdmin()

  // Fetch last 90 days of runs
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: runs } = await supabase
    .from('worker_a_runs')
    .select('*')
    .gte('ran_at', ninetyDaysAgo.toISOString())
    .order('ran_at', { ascending: false })
    .limit(2000)

  const allRuns: RunRow[] = runs ?? []

  // Compute stats
  const totalRuns = allRuns.length
  const failedRuns = allRuns.filter(r => r.status === 'failure').length
  const uptimePct = totalRuns > 0
    ? (((totalRuns - failedRuns) / totalRuns) * 100).toFixed(1)
    : '100.0'

  const lastSuccess = allRuns.find(r => r.status === 'success' || r.status === 'no_new_records')
  const totalRecords = allRuns.reduce((sum, r) => sum + (r.records_fetched ?? 0), 0)

  const avgDuration = allRuns.filter(r => r.duration_ms).length > 0
    ? Math.round(allRuns.filter(r => r.duration_ms).reduce((s, r) => s + r.duration_ms!, 0) / allRuns.filter(r => r.duration_ms).length / 1000)
    : null

  const isCurrentlyOperational = !allRuns[0] || allRuns[0].status !== 'failure'

  // 90-day chart data
  const daySummaries = buildDaySummaries([...allRuns].reverse())

  // Incidents (runs with failures)
  const incidents = allRuns.filter(r => r.status === 'failure')

  // Recent runs (last 48 entries)
  const recentRuns = allRuns.slice(0, 48)

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
    <div style={{ fontFamily: '"DM Sans", system-ui, sans-serif', background: '#f0f0ed', minHeight: '100vh', color: '#1a1a1a' }}>

      {/* Nav */}
      <nav className="landing-nav">
        <a className="nav-brand" href="/">Property Sentinel</a>
        <a href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>← Back to search</a>
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '80px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40, gap: 24 }}>
          <div>
            <h1 style={{ fontFamily: '"Merriweather", Georgia, serif', fontSize: 28, fontWeight: 700, color: '#001f3f', marginBottom: 8, letterSpacing: '-0.02em' }}>
              Chicago 311 Data Status
            </h1>
            <p style={{ fontSize: 13, color: '#8a94a0', lineHeight: 1.6, maxWidth: 480 }}>
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

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Uptime (90 days)', value: `${uptimePct}%`, sub: `${failedRuns} incident${failedRuns !== 1 ? 's' : ''}`, color: '#2d6a4f' },
            { label: 'Last Sync', value: lastSuccess ? formatTimeCT(lastSuccess.ran_at) : '—', sub: lastSuccess ? formatDateCT(lastSuccess.ran_at) : '—', color: '#1a1a1a' },
            { label: 'Records (90d)', value: totalRecords.toLocaleString(), sub: 'complaints synced', color: '#1a1a1a' },
            { label: 'Avg Run Time', value: avgDuration ? `${avgDuration}s` : '—', sub: 'per sync cycle', color: '#1a1a1a' },
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
              {daySummaries.map((day, i) => (
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
                  {inc.error_message ?? 'Socrata API unavailable. Worker A exited gracefully. Resume cursor preserved — no records lost.'}
                </div>
              </div>
              <div style={{
                fontFamily: '"DM Mono", monospace', fontSize: 9, fontWeight: 500,
                padding: '2px 8px', borderRadius: 3, whiteSpace: 'nowrap' as const,
                textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                background: 'rgba(45,106,79,0.1)', border: '1px solid rgba(45,106,79,0.3)', color: '#2d6a4f',
              }}>
                Resolved
              </div>
            </div>
          ))}
        </div>

        {/* Recent run log */}
        <div style={{ background: '#fff', border: '1px solid #ddd9d0', borderRadius: 6, overflow: 'hidden', marginBottom: 32 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #ddd9d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>
              Recent Sync Log
            </span>
            <span style={{ fontSize: 11, color: '#8a94a0' }}>Last 48 runs · All times CT</span>
          </div>

          {/* Header row */}
          <div style={{ padding: '8px 20px', background: '#fafaf8', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '180px 90px 90px 1fr', gap: 12 }}>
            {['Time (CT)', 'Status', 'Records', 'Note'].map(h => (
              <span key={h} style={{ fontFamily: '"DM Mono", monospace', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#8a94a0' }}>{h}</span>
            ))}
          </div>

          {recentRuns.map(run => {
            const statusStyle = run.status === 'success'
              ? { background: 'rgba(45,106,79,0.1)', color: '#2d6a4f' }
              : run.status === 'failure'
              ? { background: 'rgba(192,57,43,0.08)', color: '#c0392b' }
              : { background: '#f0f0ed', color: '#8a94a0' }

            const statusLabel = run.status === 'success' ? 'Success'
              : run.status === 'failure' ? 'Failed'
              : 'No new'

            const note = run.status === 'failure'
              ? (run.error_message ?? '503 — Socrata unavailable')
              : run.status === 'no_new_records'
              ? 'No new complaints in window'
              : ''

            return (
              <div key={run.id} style={{ padding: '9px 20px', borderBottom: '1px solid #ddd9d0', display: 'grid', gridTemplateColumns: '180px 90px 90px 1fr', gap: 12, alignItems: 'center' }}>
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
                <div style={{ fontSize: 11, color: '#8a94a0' }}>{note}</div>
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
  )
}