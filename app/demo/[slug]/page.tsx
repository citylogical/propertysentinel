import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { chunkedIn, getAllAddresses } from '@/lib/portfolio-stats'
import { OWNER_RELEVANT_CODES, DEPARTMENT_BY_CODE } from '@/lib/sr-codes'
import { getDemoPortfolio } from '@/lib/demo-portfolios'
import type { PortfolioProperty } from '@/app/dashboard/types'
import DemoView, { type DemoHighlights } from './DemoView'

// Publicly accessible portfolio demo (anyone with the link). The portfolio is
// a real portfolio_properties set owned by a synthetic demo user (see
// lib/demo-portfolios.ts + scripts/seed-troy-demo-portfolio.ts), so the
// counts here move as the city data updates. Rendered fresh per request —
// the whole point of the page is that the numbers are live.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const demo = getDemoPortfolio(slug)
  return {
    title: demo ? `${demo.companyName} — Property Sentinel` : 'Demo — Property Sentinel',
    robots: { index: false, follow: false },
  }
}

type ComplaintLite = {
  sr_number?: string | null
  sr_short_code?: string | null
  status?: string | null
  duplicate?: boolean | null
  created_date?: string | null
}

// Server-only date helpers (the page is force-dynamic, so these evaluate per
// request; kept out of the component body for the react purity lint).
function twelveMonthsAgoIso(): string {
  return new Date(Date.now() - 365 * 86400000).toISOString()
}

function chicagoTodayStr(): string {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function DemoPage({ params }: PageProps) {
  const { slug } = await params
  const demo = getDemoPortfolio(slug)
  if (!demo) return notFound()

  const supabase = getSupabaseAdmin()

  const { data: rows } = await supabase
    .from('portfolio_properties')
    .select(
      `
      id,
      canonical_address,
      address_range,
      additional_streets,
      pins,
      slug,
      display_name,
      units_override,
      sqft_override,
      notes,
      alerts_enabled,
      created_at,
      open_complaints,
      total_complaints_12mo,
      open_building_complaints,
      total_building_complaints_12mo,
      latest_building_complaint_date,
      open_violations,
      total_violations_12mo,
      total_permits_12mo,
      shvr_count,
      is_pbl,
      has_stop_work,
      str_registrations,
      is_restricted_zone,
      nearby_listings,
      implied_value,
      property_class,
      year_built,
      community_area
    `
    )
    .eq('user_id', demo.userId)
    .order('canonical_address', { ascending: true })

  if (!rows || rows.length === 0) return notFound()

  const properties: PortfolioProperty[] = rows.map((p) => ({
    id: p.id as string,
    canonical_address: p.canonical_address as string,
    address_range: (p.address_range as string | null) ?? null,
    additional_streets: (p.additional_streets as string[] | null) ?? null,
    pins: (p.pins as string[] | null) ?? null,
    slug: (p.slug as string) ?? '',
    display_name: (p.display_name as string | null) ?? null,
    units_override: null,
    units_total: 0,
    units_status_breakdown: {},
    units_tag_breakdown: {},
    sqft_override: (p.sqft_override as number | null) ?? null,
    notes: null,
    alerts_enabled: Boolean(p.alerts_enabled),
    created_at: p.created_at as string,
    open_violations: Number(p.open_violations ?? 0),
    open_complaints: Number(p.open_complaints ?? 0),
    total_complaints_12mo: Number(p.total_complaints_12mo ?? 0),
    open_building_complaints:
      p.open_building_complaints == null ? null : Number(p.open_building_complaints),
    total_building_complaints_12mo:
      p.total_building_complaints_12mo == null ? null : Number(p.total_building_complaints_12mo),
    latest_building_complaint_date: (p.latest_building_complaint_date as string | null) ?? null,
    total_violations_12mo: Number(p.total_violations_12mo ?? 0),
    total_permits: Number(p.total_permits_12mo ?? 0),
    shvr_count: Number(p.shvr_count ?? 0),
    is_pbl: Boolean(p.is_pbl),
    has_stop_work: Boolean(p.has_stop_work),
    str_registrations: Number(p.str_registrations ?? 0),
    is_restricted_zone: Boolean(p.is_restricted_zone),
    nearby_listings: Number(p.nearby_listings ?? 0),
    implied_value: (p.implied_value as number | null) ?? null,
    community_area: (p.community_area as string | null) ?? null,
    property_class: (p.property_class as string | null) ?? null,
    building_chars: { year_built: (p.year_built as number | string | null) ?? null },
    latest_violation_date: null,
    latest_permit_date: null,
    recent_complaints: [],
    recent_violations: [],
    recent_permits: [],
  }))

  // ── Highlights: live 12-month complaint pull across the whole portfolio ──
  // One indexed query (sr codes scoped to the 29 owner-relevant categories)
  // powers the headline complaint count, the open count, and the
  // by-department exposure breakdown. Violations/permits tiles come from the
  // per-property cached stats, same as the dashboard table.
  const allAddresses = Array.from(
    new Set(
      properties.flatMap((p) =>
        getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)
      )
    )
  )
  const twelveMonthsAgo = twelveMonthsAgoIso()
  const ownerCodes = Array.from(OWNER_RELEVANT_CODES)

  const { data: complaints } = await chunkedIn<ComplaintLite>(
    allAddresses,
    200,
    (chunk) =>
      supabase
        .from('complaints_311')
        .select('sr_number, sr_short_code, status, duplicate, created_date')
        .in('address_normalized', chunk)
        .in('sr_short_code', ownerCodes)
        .gte('created_date', twelveMonthsAgo)
        .limit(2000),
    (row) => String(row.sr_number ?? '')
  )

  const complaintRows = complaints ?? []
  const deptCounts = new Map<string, { count: number; open: number }>()
  let openComplaints = 0
  let latestComplaint: string | null = null
  for (const c of complaintRows) {
    const code = (c.sr_short_code ?? '').toUpperCase()
    const dept = DEPARTMENT_BY_CODE[code] ?? 'Other'
    const isOpen = String(c.status ?? '').toLowerCase() === 'open' && c.duplicate !== true
    const entry = deptCounts.get(dept) ?? { count: 0, open: 0 }
    entry.count++
    if (isOpen) {
      entry.open++
      openComplaints++
    }
    deptCounts.set(dept, entry)
    if (c.created_date && (!latestComplaint || c.created_date > latestComplaint)) {
      latestComplaint = c.created_date
    }
  }

  const highlights: DemoHighlights = {
    complaints12mo: complaintRows.length,
    openComplaints,
    latestComplaint,
    violations12mo: properties.reduce((s, p) => s + (p.total_violations_12mo ?? 0), 0),
    openViolations: properties.reduce((s, p) => s + (p.open_violations ?? 0), 0),
    permits12mo: properties.reduce((s, p) => s + (p.total_permits ?? 0), 0),
    propertiesWithActivity: properties.filter(
      (p) =>
        (p.total_building_complaints_12mo ?? p.total_complaints_12mo ?? 0) > 0 ||
        (p.total_violations_12mo ?? 0) > 0
    ).length,
    departments: Array.from(deptCounts.entries())
      .map(([department, v]) => ({ department, count: v.count, open: v.open }))
      .sort((a, b) => b.count - a.count),
  }

  const todayStr = chicagoTodayStr()

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <DemoView
          demo={{
            slug: demo.slug,
            companyName: demo.companyName,
            initials: demo.initials,
            sampleDescription: demo.sampleDescription,
          }}
          properties={properties}
          highlights={highlights}
          todayStr={todayStr}
        />
      </div>
    </div>
  )
}
