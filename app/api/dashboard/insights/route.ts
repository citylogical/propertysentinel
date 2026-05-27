import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { chunkedIn, getAllAddresses } from '@/lib/portfolio-stats'
import { DEFAULT_VISIBLE_CODES } from '@/lib/sr-codes'
import type { InsightsData, WhatChangedEvent, HotProperty } from '@/app/dashboard/insights/types'

export const maxDuration = 60
export const runtime = 'nodejs'

// ─── Scope code sets ─────────────────────────────────────────────────────
// Building + Property = DEFAULT_VISIBLE_CODES from lib/sr-codes (the 49
// codes marked defaultVisible: true).
//
// Actionable scope: enrichable building/property codes + WCA3 + PETCO.
// Verified against lib/sr-codes.ts March 2026.
//
// Inclusion criteria:
//   1. enrichable === true in sr-codes.ts (Worker C tracks workflow state), OR
//   2. WCA3 / PETCO — actionable owner-relevant codes that aren't enrichable
//      (default to Assign Inspector bead when open).
//
// Exclusions:
//   - Business category enrichables (HFB, RBL, BAG, BAM, CSF, CST, CAFE,
//     CORNVEND, FPC, ODM, MWC) — restaurant/retail complaints, not
//     property-owner concerns.
//   - WCA2 — city test-kit shortage means it dominates raw counts without
//     representing real actionable work.
const ACTIONABLE_CODES = new Set([
  // Building category, enrichable (15)
  'BBA', 'BBC', 'BBD', 'BBK', 'BPI', 'FAC', 'HDF', 'SCB', 'SHVR',
  'NAC', 'AAF', 'WM3', 'WBJ', 'WBK', 'WCA',
  // Other category, enrichable + property-relevant (2)
  'EAF', 'SGA',
  // Street infrastructure, enrichable + property-adjacent (3)
  'AAD', 'AAI', 'SEC',
  // Non-enrichable but actionable (2)
  'WCA3', 'PETCO',
])

// SR codes excluded from the "Complaints by SR type" and aging slides.
const EXCLUDED_FROM_AGING = new Set(['WCA2'])

const CHUNK_SIZE = 200

// ─── Helpers ────────────────────────────────────────────────────────────
function ageLabel(timestampIso: string): string {
  const ms = Date.now() - new Date(timestampIso).getTime()
  if (ms < 0) return 'now'
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${Math.max(1, min)}m`
  const hr = Math.floor(ms / 3600000)
  if (hr < 48) return `${hr}h`
  const d = Math.floor(ms / 86400000)
  return `${d}d`
}

function ageBucket(createdIso: string): keyof InsightsData['aging_buckets'] {
  const days = (Date.now() - new Date(createdIso).getTime()) / 86400000
  if (days <= 7) return 'days_0_7'
  if (days <= 30) return 'days_8_30'
  if (days <= 60) return 'days_31_60'
  return 'days_60_plus'
}

function classifyOutcome(outcome: string | null): 'productive' | 'no_cause' | 'owner_responsibility' {
  if (!outcome) return 'no_cause'
  const o = outcome.toLowerCase()
  if (o.includes("owner's responsibility") || o.includes('owner responsibility')) {
    return 'owner_responsibility'
  }
  if (
    o.includes('no cause') ||
    o.includes('no problem found') ||
    o.includes('no entry') ||
    o.includes('unable')
  ) {
    return 'no_cause'
  }
  return 'productive'
}

// ─── Row types for chunkedIn generics ────────────────────────────────────
type OpenComplaintRow = {
  sr_number: string | null
  sr_short_code: string | null
  sr_type: string | null
  status: string | null
  created_date: string | null
  sla_target_days: number | null
  duplicate: boolean | null
  workflow_step: string | null
  work_order_status: string | null
  final_outcome: string | null
  address_normalized: string | null
}

type Recent60dComplaintRow = {
  sr_number: string | null
  sr_short_code: string | null
  sr_type: string | null
  status: string | null
  created_date: string | null
  closed_date: string | null
  final_outcome: string | null
  work_order_status: string | null
  address_normalized: string | null
}

type Violation7dRow = {
  inspection_number: string | null
  violation_id: string | null
  is_stop_work_order: boolean | null
  violation_date: string | null
  inspection_category: string | null
  address_normalized: string | null
}

type Violation60dRow = {
  violation_date: string | null
  inspection_number: string | null
  violation_id: string | null
  address_normalized: string | null
}

type PermitRow60d = {
  permit_number: string | null
  permit_type: string | null
  issue_date: string | null
  reported_cost: number | string | null
  address_normalized: string | null
}

type PermitDollarsRow = {
  permit_number: string | null
  reported_cost: number | string | null
}

// ─── Main handler ───────────────────────────────────────────────────────
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Defense-in-depth admin gate at the API layer.
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id, role, organization, clerk_id')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (!subscriber || subscriber.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ─── Portfolio properties ────────────────────────────────────────────
  const { data: properties, error: propsErr } = await supabase
    .from('portfolio_properties')
    .select(
      'id, canonical_address, address_range, additional_streets, pins, slug, display_name, community_area, open_complaints, open_building_complaints, overdue_complaints_count, has_stop_work, latest_building_complaint_date'
    )
    .eq('user_id', userId)

  if (propsErr) {
    return NextResponse.json({ error: propsErr.message }, { status: 500 })
  }

  const props = (properties ?? []) as Array<{
    id: string
    canonical_address: string
    address_range: string | null
    additional_streets: string[] | null
    pins: string[] | null
    slug: string | null
    display_name: string | null
    community_area: string | null
    open_complaints: number | null
    open_building_complaints: number | null
    overdue_complaints_count: number | null
    has_stop_work: boolean | null
    latest_building_complaint_date: string | null
  }>

  const addressToProperty = new Map<
    string,
    { id: string; display: string; slug: string | null; community_area: string | null }
  >()
  for (const p of props) {
    const meta = {
      id: p.id,
      display: p.display_name || p.canonical_address,
      slug: p.slug,
      community_area: p.community_area,
    }
    for (const addr of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
      addressToProperty.set(addr, meta)
    }
  }
  const allAddresses = Array.from(addressToProperty.keys())

  // Empty portfolio fast path
  if (allAddresses.length === 0) {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      meta: { org_name: subscriber.organization ?? null, portfolio_buildings: 0, portfolio_units: 0 },
      scope: { all_open: 0, building_property: 0, actionable: 0 },
      headline: { addresses_with_activity: 0, addresses_sample: [], workflow_changes_count: 0, workflow_closures_count: 0, closure_sample_address: null, overdue_count: 0 },
      kpis: { open_complaints: 0, open_complaints_delta_pct: null, new_7d: 0, new_7d_delta_pct: null, closed_7d: 0, closed_7d_outcomes: { productive: 0, no_cause: 0, owner_responsibility: 0 }, overdue: 0, overdue_delta_24h: 0, permits_ytd_dollars: 0, permits_ytd_delta_pct_yoy: null },
      workflow_beads: { assign_inspector: 0, investigation: 0, case_review: 0, perform_work: 0, closed_30d: 0 },
      daily_activity: [],
      complaints_by_type: [],
      aging_buckets: { days_0_7: 0, days_8_30: 0, days_31_60: 0, days_60_plus: 0 },
      what_changed: [],
      hot_properties: [],
    } satisfies InsightsData)
  }

  const now = new Date()
  const nowMs = now.getTime()
  const day = 86400000
  const cutoff60d = new Date(nowMs - 60 * day).toISOString()
  const cutoff30d = new Date(nowMs - 30 * day).toISOString()
  const cutoff14d = new Date(nowMs - 14 * day).toISOString()
  const cutoff7d = new Date(nowMs - 7 * day).toISOString()
  const cutoff24h = new Date(nowMs - day).toISOString()
  const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString()
  const ytdStartPriorYr = new Date(now.getFullYear() - 1, 0, 1).toISOString()
  const ytdEndPriorYr = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString()

  // ─── Parallel fetches — ALL address-filtered queries are chunked ─────
  // Supabase REST URLs blow past ~8KB with portfolios above 150+ addresses.
  // chunkedIn batches the .in() filter and accumulates results in memory,
  // with dedupe by a stable key (sr_number / inspection_number / permit_number).
  const [
    openComplaintsRes,
    recentComplaints60dRes,
    violations7dRes,
    violations60dRes,
    permits60dRes,
    snapshotsRes,
    ytdPermitsRes,
    priorYrPermitsRes,
  ] = await Promise.all([
    chunkedIn<OpenComplaintRow>(
      allAddresses,
      CHUNK_SIZE,
      (chunk) =>
        supabase
          .from('complaints_311')
          .select('sr_number, sr_short_code, sr_type, status, created_date, sla_target_days, duplicate, workflow_step, work_order_status, final_outcome, address_normalized')
          .in('address_normalized', chunk)
          .ilike('status', 'open')
          .or('duplicate.is.null,duplicate.is.false'),
      (row) => String(row.sr_number ?? '')
    ),
    chunkedIn<Recent60dComplaintRow>(
      allAddresses,
      CHUNK_SIZE,
      (chunk) =>
        supabase
          .from('complaints_311')
          .select('sr_number, sr_short_code, sr_type, status, created_date, closed_date, final_outcome, work_order_status, address_normalized')
          .in('address_normalized', chunk)
          .gte('created_date', cutoff60d)
          .or('duplicate.is.null,duplicate.is.false'),
      (row) => String(row.sr_number ?? '')
    ),
    chunkedIn<Violation7dRow>(
      allAddresses,
      CHUNK_SIZE,
      (chunk) =>
        supabase
          .from('violations')
          .select('inspection_number, violation_id, is_stop_work_order, violation_date, inspection_category, address_normalized')
          .in('address_normalized', chunk)
          .gte('created_at', cutoff7d),
      (row) => String(row.violation_id ?? '')
    ),
    chunkedIn<Violation60dRow>(
      allAddresses,
      CHUNK_SIZE,
      (chunk) =>
        supabase
          .from('violations')
          .select('violation_date, inspection_number, violation_id, address_normalized')
          .in('address_normalized', chunk)
          .gte('violation_date', cutoff60d),
      (row) => String(row.violation_id ?? '')
    ),
    chunkedIn<PermitRow60d>(
      allAddresses,
      CHUNK_SIZE,
      (chunk) =>
        supabase
          .from('permits')
          .select('permit_number, permit_type, issue_date, reported_cost, address_normalized')
          .in('address_normalized', chunk)
          .gte('created_at', cutoff60d),
      (row) => String(row.permit_number ?? '')
    ),
    // Snapshots query has no address filter — it pulls all snapshots in the
    // 7d window and we filter in memory via srToAddr below. No chunking needed.
    supabase
      .from('complaint_workflow_snapshots')
      .select('sr_number, observed_at, workflow_step, work_order_status, final_outcome, previous_workflow_step, previous_work_order_status, previous_final_outcome')
      .gte('observed_at', cutoff7d)
      .order('observed_at', { ascending: false }),
    chunkedIn<PermitDollarsRow>(
      allAddresses,
      CHUNK_SIZE,
      (chunk) =>
        supabase
          .from('permits')
          .select('permit_number, reported_cost')
          .in('address_normalized', chunk)
          .gte('issue_date', ytdStart),
      (row) => String(row.permit_number ?? '')
    ),
    chunkedIn<PermitDollarsRow>(
      allAddresses,
      CHUNK_SIZE,
      (chunk) =>
        supabase
          .from('permits')
          .select('permit_number, reported_cost')
          .in('address_normalized', chunk)
          .gte('issue_date', ytdStartPriorYr)
          .lt('issue_date', ytdEndPriorYr),
      (row) => String(row.permit_number ?? '')
    ),
  ])

  if (openComplaintsRes.error) {
    return NextResponse.json({ error: String(openComplaintsRes.error) }, { status: 500 })
  }

  const openComplaints = openComplaintsRes.data ?? []
  const recent60d = recentComplaints60dRes.data ?? []
  const violations7d = violations7dRes.data ?? []
  const violations60d = violations60dRes.data ?? []
  const permits60d = permits60dRes.data ?? []
  const ytdPermitDollars = ytdPermitsRes.data ?? []
  const priorYrPermitDollars = priorYrPermitsRes.data ?? []
  const snapshots7d = (snapshotsRes.data ?? []) as Array<{
    sr_number: string
    observed_at: string
    workflow_step: string | null
    work_order_status: string | null
    final_outcome: string | null
    previous_workflow_step: string | null
    previous_work_order_status: string | null
    previous_final_outcome: string | null
  }>

  // sr_number → address_normalized lookup, used to scope snapshots to portfolio
  // and to look up display addresses for What Changed events.
  const srToAddr = new Map<string, string>()
  for (const c of openComplaints) {
    if (c.sr_number && c.address_normalized) srToAddr.set(c.sr_number, c.address_normalized)
  }
  for (const c of recent60d) {
    if (c.sr_number && c.address_normalized) srToAddr.set(c.sr_number, c.address_normalized)
  }
  const snapsScopedToPortfolio = snapshots7d.filter((s) => srToAddr.has(s.sr_number))

  // ─── Scope counts ────────────────────────────────────────────────────
  const allOpen = openComplaints.length
  const buildingProperty = openComplaints.filter((c) =>
    DEFAULT_VISIBLE_CODES.has((c.sr_short_code ?? '').toUpperCase())
  ).length
  const actionable = openComplaints.filter((c) =>
    ACTIONABLE_CODES.has((c.sr_short_code ?? '').toUpperCase())
  ).length

  // ─── Workflow beads (over actionable open) ───────────────────────────
  const beads = { assign_inspector: 0, investigation: 0, case_review: 0, perform_work: 0, closed_30d: 0 }
  for (const c of openComplaints) {
    if (!ACTIONABLE_CODES.has((c.sr_short_code ?? '').toUpperCase())) continue
    const step = (c.workflow_step ?? '').toLowerCase()
    if (step.includes('case review')) beads.case_review++
    else if (step.includes('perform work')) beads.perform_work++
    else if (step.includes('investigation') || step.includes('inspection')) beads.investigation++
    else beads.assign_inspector++
  }
  // Closed bead is 30d rolling.
  for (const c of recent60d) {
    if (!c.closed_date) continue
    if (c.closed_date < cutoff30d) continue
    if (!ACTIONABLE_CODES.has((c.sr_short_code ?? '').toUpperCase())) continue
    if (String(c.status ?? '').toLowerCase() === 'open') continue
    beads.closed_30d++
  }

  // ─── Aging buckets (actionable open) ─────────────────────────────────
  const aging = { days_0_7: 0, days_8_30: 0, days_31_60: 0, days_60_plus: 0 }
  for (const c of openComplaints) {
    const code = (c.sr_short_code ?? '').toUpperCase()
    if (!ACTIONABLE_CODES.has(code)) continue
    if (EXCLUDED_FROM_AGING.has(code)) continue
    if (!c.created_date) continue
    aging[ageBucket(c.created_date)]++
  }

  // ─── Daily activity (60 days × 3 categories) ─────────────────────────
  const buckets = new Map<string, { complaints: number; violations: number; permits: number }>()
  for (let i = 0; i < 60; i++) {
    const d = new Date(nowMs - (59 - i) * day)
    const key = d.toISOString().slice(0, 10)
    buckets.set(key, { complaints: 0, violations: 0, permits: 0 })
  }
  for (const c of recent60d) {
    if (!c.created_date) continue
    const key = c.created_date.slice(0, 10)
    const b = buckets.get(key)
    if (b) b.complaints++
  }
  const seenInspections = new Set<string>()
  for (const v of violations60d) {
    if (!v.violation_date) continue
    if (v.inspection_number && seenInspections.has(v.inspection_number)) continue
    if (v.inspection_number) seenInspections.add(v.inspection_number)
    const key = v.violation_date.slice(0, 10)
    const b = buckets.get(key)
    if (b) b.violations++
  }
  const seenPermits = new Set<string>()
  for (const p of permits60d) {
    if (!p.issue_date) continue
    if (p.permit_number && seenPermits.has(p.permit_number)) continue
    if (p.permit_number) seenPermits.add(p.permit_number)
    const key = p.issue_date.slice(0, 10)
    const b = buckets.get(key)
    if (b) b.permits++
  }
  const dailyActivity = Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }))

  // ─── Complaints by SR type (60 days, top 6) ──────────────────────────
  const codeCounts = new Map<string, { code: string; label: string; count: number }>()
  for (const c of recent60d) {
    const code = (c.sr_short_code ?? '').toUpperCase()
    if (!code) continue
    if (EXCLUDED_FROM_AGING.has(code)) continue
    if (!DEFAULT_VISIBLE_CODES.has(code)) continue
    const existing = codeCounts.get(code)
    if (existing) {
      existing.count++
    } else {
      codeCounts.set(code, { code, label: c.sr_type ?? code, count: 1 })
    }
  }
  const complaintsByType = Array.from(codeCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // ─── KPIs ────────────────────────────────────────────────────────────
  const new7d = recent60d.filter((c) => c.created_date && c.created_date >= cutoff7d).length
  const new14d = recent60d.filter((c) => c.created_date && c.created_date >= cutoff14d).length
  const priorWeekNew = new14d - new7d
  const new7dDelta = priorWeekNew > 0 ? Math.round(((new7d - priorWeekNew) / priorWeekNew) * 100) : null

  const closed7d = recent60d.filter((c) => c.closed_date && c.closed_date >= cutoff7d).length
  const closed7dOutcomes = { productive: 0, no_cause: 0, owner_responsibility: 0 }
  for (const c of recent60d) {
    if (!c.closed_date || c.closed_date < cutoff7d) continue
    const cat = classifyOutcome(c.final_outcome)
    closed7dOutcomes[cat]++
  }

  const new30d = recent60d.filter((c) => c.created_date && c.created_date >= cutoff30d).length
  const closed30d = beads.closed_30d
  const net30d = new30d - closed30d
  const openComplaintsDelta = actionable > 0 && net30d !== 0
    ? Math.round((net30d / Math.max(1, actionable)) * 100)
    : null

  // Overdue count from cached column (Worker C Phase 3 populates).
  const overdueCount = props.reduce((s, p) => s + (p.overdue_complaints_count ?? 0), 0)
  let overdueDelta24h = 0
  for (const c of openComplaints) {
    if (!c.created_date || c.sla_target_days == null) continue
    const created = new Date(c.created_date).getTime()
    const dueMs = created + c.sla_target_days * day
    if (dueMs >= nowMs - day && dueMs < nowMs) overdueDelta24h++
  }

  const ytdDollars = ytdPermitDollars.reduce(
    (s, p) => s + (p.reported_cost ? Number(p.reported_cost) : 0),
    0
  )
  const priorYrDollars = priorYrPermitDollars.reduce(
    (s, p) => s + (p.reported_cost ? Number(p.reported_cost) : 0),
    0
  )
  const permitsYoYDelta = priorYrDollars > 0
    ? Math.round(((ytdDollars - priorYrDollars) / priorYrDollars) * 100)
    : null

  // ─── Headline data (last 24h) ────────────────────────────────────────
  const addrsWithActivity = new Set<string>()
  for (const c of recent60d) {
    if (c.created_date && c.created_date >= cutoff24h && c.address_normalized) {
      addrsWithActivity.add(c.address_normalized)
    }
  }
  for (const v of violations7d) {
    if (v.violation_date && v.violation_date >= cutoff24h && v.address_normalized) {
      addrsWithActivity.add(v.address_normalized)
    }
  }
  for (const p of permits60d) {
    if (p.issue_date && p.issue_date >= cutoff24h && p.address_normalized) {
      addrsWithActivity.add(p.address_normalized)
    }
  }
  const addrSample: string[] = []
  for (const addr of addrsWithActivity) {
    const meta = addressToProperty.get(addr)
    if (meta && addrSample.length < 2) addrSample.push(meta.display)
  }

  const wfChanges24h = snapsScopedToPortfolio.filter((s) => s.observed_at >= cutoff24h)
  const wfClosures24h = wfChanges24h.filter(
    (s) =>
      (s.work_order_status ?? '').toLowerCase() === 'closed' &&
      (s.previous_work_order_status ?? '').toLowerCase() !== 'closed'
  )
  let closureSampleAddress: string | null = null
  for (const s of wfClosures24h) {
    const addr = srToAddr.get(s.sr_number)
    if (addr) {
      closureSampleAddress = addressToProperty.get(addr)?.display ?? null
      if (closureSampleAddress) break
    }
  }

  // ─── What Changed (7 days, top 10) ───────────────────────────────────
  const whatChanged: WhatChangedEvent[] = []

  const seenStopWorks = new Set<string>()
  for (const v of violations7d) {
    if (!v.is_stop_work_order) continue
    const key = v.inspection_number ?? v.violation_id ?? ''
    if (key && seenStopWorks.has(key)) continue
    if (key) seenStopWorks.add(key)
    if (!v.address_normalized || !v.violation_date) continue
    const meta = addressToProperty.get(v.address_normalized)
    if (!meta) continue
    whatChanged.push({
      kind: 'stop_work',
      label: 'Stop-work order issued',
      address: meta.display,
      property_slug: meta.slug,
      timestamp: v.violation_date,
      age_label: ageLabel(v.violation_date),
    })
  }

  for (const s of snapsScopedToPortfolio) {
    const addr = srToAddr.get(s.sr_number)
    if (!addr) continue
    const meta = addressToProperty.get(addr)
    if (!meta) continue

    const isClosure =
      (s.work_order_status ?? '').toLowerCase() === 'closed' &&
      (s.previous_work_order_status ?? '').toLowerCase() !== 'closed'

    if (isClosure) {
      const cat = classifyOutcome(s.final_outcome)
      const label =
        cat === 'owner_responsibility'
          ? `Complaint closed — Owner's Responsibility`
          : cat === 'productive'
            ? `Complaint closed — ${s.final_outcome ?? 'resolved'}`
            : `Complaint closed — ${s.final_outcome ?? 'no cause'}`
      whatChanged.push({
        kind: cat === 'owner_responsibility' ? 'owner_resp' : 'closure',
        label,
        address: meta.display,
        property_slug: meta.slug,
        timestamp: s.observed_at,
        age_label: ageLabel(s.observed_at),
      })
    } else if (s.workflow_step && s.workflow_step !== s.previous_workflow_step) {
      const fromLabel = s.previous_workflow_step ?? '(new)'
      const toLabel = s.workflow_step
      whatChanged.push({
        kind: 'transition',
        label: `Workflow moved ${fromLabel} → ${toLabel}`,
        address: meta.display,
        property_slug: meta.slug,
        timestamp: s.observed_at,
        age_label: ageLabel(s.observed_at),
      })
    }
  }

  whatChanged.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
  const whatChangedTop = whatChanged.slice(0, 10)

  // ─── Hot Properties ──────────────────────────────────────────────────
  const hotProps: HotProperty[] = props
    .map((p) => {
      const overdue = p.overdue_complaints_count ?? 0
      const open = p.open_building_complaints ?? p.open_complaints ?? 0
      let liability_kind: HotProperty['liability_kind'] = null
      let liability_label: string | null = null
      if (p.has_stop_work) {
        liability_kind = 'stop_work'
        liability_label = 'Stop-work'
      }
      const lastEventIso = p.latest_building_complaint_date
      return {
        id: p.id,
        slug: p.slug,
        address: p.display_name || p.canonical_address,
        community_area: p.community_area,
        open,
        overdue,
        liability_kind,
        liability_label,
        last_event_age: lastEventIso ? `${ageLabel(lastEventIso)} ago` : null,
      } satisfies HotProperty
    })
    .filter((h) => h.open > 0 || h.overdue > 0)
    .sort((a, b) => {
      if (b.overdue !== a.overdue) return b.overdue - a.overdue
      return b.open - a.open
    })
    .slice(0, 5)

  // ─── Assemble response ───────────────────────────────────────────────
  const response: InsightsData = {
    generated_at: now.toISOString(),
    meta: {
      org_name: subscriber.organization ?? null,
      portfolio_buildings: props.length,
      portfolio_units: 0,
    },
    scope: {
      all_open: allOpen,
      building_property: buildingProperty,
      actionable,
    },
    headline: {
      addresses_with_activity: addrsWithActivity.size,
      addresses_sample: addrSample,
      workflow_changes_count: wfChanges24h.length,
      workflow_closures_count: wfClosures24h.length,
      closure_sample_address: closureSampleAddress,
      overdue_count: overdueCount,
    },
    kpis: {
      open_complaints: actionable,
      open_complaints_delta_pct: openComplaintsDelta,
      new_7d: new7d,
      new_7d_delta_pct: new7dDelta,
      closed_7d: closed7d,
      closed_7d_outcomes: closed7dOutcomes,
      overdue: overdueCount,
      overdue_delta_24h: overdueDelta24h,
      permits_ytd_dollars: Math.round(ytdDollars),
      permits_ytd_delta_pct_yoy: permitsYoYDelta,
    },
    workflow_beads: beads,
    daily_activity: dailyActivity,
    complaints_by_type: complaintsByType,
    aging_buckets: aging,
    what_changed: whatChangedTop,
    hot_properties: hotProps,
  }

  return NextResponse.json(response)
}