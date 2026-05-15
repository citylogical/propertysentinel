import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { chunkedIn, getAllAddresses } from '@/lib/portfolio-stats'
import { SR_CODES } from '@/lib/sr-codes'

const BUILDING_SR_CODES = SR_CODES.filter((e) => e.category === 'building').map((e) => e.code)
const BUILDING_CODE_SET = new Set(BUILDING_SR_CODES.map((c) => c.toUpperCase()))

export const maxDuration = 30

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // ─── Fetch all portfolio rows with the columns we need ─────────────────
  const { data: properties, error: propsErr } = await supabase
    .from('portfolio_properties')
    .select(
      'id, canonical_address, address_range, additional_streets, pins, display_name, community_area, open_building_complaints, total_building_complaints_12mo, open_violations, total_violations_12mo, total_permits_12mo, has_stop_work, latest_building_complaint_date'
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
    display_name: string | null
    community_area: string | null
    open_building_complaints: number | null
    total_building_complaints_12mo: number | null
    open_violations: number | null
    total_violations_12mo: number | null
    total_permits_12mo: number | null
    has_stop_work: boolean | null
    latest_building_complaint_date: string | null
  }>

  // ─── Unit aggregates: count + status + tag breakdown + gross rent ──────
  const propIds = props.map((p) => p.id)
  let totalUnits = 0
  const statusCounts: Record<string, number> = {}
  const tagCounts: Record<string, number> = {}
  let grossMonthlyRent = 0

  if (propIds.length > 0) {
    const { data: units } = await supabase
      .from('portfolio_property_units')
      .select('status, tag, rent')
      .in('portfolio_property_id', propIds)

    for (const u of (units ?? []) as Array<{ status: string | null; tag: string | null; rent: number | null }>) {
      totalUnits++
      if (u.status) statusCounts[u.status] = (statusCounts[u.status] ?? 0) + 1
      if (u.tag) tagCounts[u.tag] = (tagCounts[u.tag] ?? 0) + 1
      if (u.rent != null && Number.isFinite(u.rent)) grossMonthlyRent += Number(u.rent)
    }
  }

  // ─── Portfolio-wide aggregates from properties table ───────────────────
  const totalProperties = props.length
  const openBuildingComplaints = props.reduce((s, p) => s + (p.open_building_complaints ?? 0), 0)
  const totalBuildingComplaints12mo = props.reduce((s, p) => s + (p.total_building_complaints_12mo ?? 0), 0)
  const openViolations = props.reduce((s, p) => s + (p.open_violations ?? 0), 0)
  const stopWorkCount = props.filter((p) => p.has_stop_work).length

  const buildingsWithOpenComplaints = props.filter((p) => (p.open_building_complaints ?? 0) > 0).length
  const buildingsWithOpenViolations = props.filter((p) => (p.open_violations ?? 0) > 0).length

  // Most recent building complaint across portfolio
  let latestBuildingComplaint: { date: string; property_display: string; property_id: string } | null = null
  for (const p of props) {
    if (!p.latest_building_complaint_date) continue
    if (
      !latestBuildingComplaint ||
      p.latest_building_complaint_date > latestBuildingComplaint.date
    ) {
      latestBuildingComplaint = {
        date: p.latest_building_complaint_date,
        property_display: p.display_name || p.canonical_address,
        property_id: p.id,
      }
    }
  }

  // ─── This-week activity counts (server-side query of last 7 days) ──────
  let weekComplaintsTotal = 0
  let weekComplaintsBuilding = 0
  let weekViolationsTotal = 0
  let weekPermitsTotal = 0
  let weekStopWorks = 0
  let weekMostRecentBuilding: {
    sr_type: string
    date: string
    property_display: string
    standard_description: string | null
  } | null = null

  if (propIds.length > 0) {
    // Resolve property → address fan-out
    const addressToProperty = new Map<string, { id: string; display: string }>()
    for (const p of props) {
      const display = p.display_name || p.canonical_address
      for (const addr of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
        addressToProperty.set(addr, { id: p.id, display })
      }
    }
    const allAddresses = Array.from(addressToProperty.keys())
    const weekCutoff = new Date(Date.now() - 7 * 86400000).toISOString()

    if (allAddresses.length > 0) {
      const [complaintsRes, violationsRes, permitsRes] = await Promise.all([
        chunkedIn<{
          sr_type: string | null
          sr_short_code: string | null
          created_date: string | null
          address_normalized: string | null
          standard_description: string | null
        }>(
          allAddresses,
          200,
          (chunk) =>
            supabase
              .from('complaints_311')
              .select('sr_type, sr_short_code, created_date, address_normalized, standard_description')
              .in('address_normalized', chunk)
              .gte('created_date', weekCutoff)
              .order('created_date', { ascending: false })
              .limit(500),
          // sr_number isn't in the SELECT here, but the route only counts —
          // dedupe by a synthetic composite key.
          (row) => `${row.address_normalized}|${row.created_date}|${row.sr_short_code}`
        ),
        chunkedIn<{
          inspection_number: string | null
          violation_status: string | null
          inspection_status: string | null
          violation_date: string | null
          is_stop_work_order: boolean | null
          address_normalized: string | null
        }>(
          allAddresses,
          200,
          (chunk) =>
            supabase
              .from('violations')
              .select('inspection_number, violation_status, inspection_status, violation_date, is_stop_work_order, address_normalized')
              .in('address_normalized', chunk)
              .gte('violation_date', weekCutoff)
              .limit(500),
          (row) => `${row.inspection_number ?? ''}|${row.address_normalized}|${row.violation_date}`
        ),
        chunkedIn<{ permit_number: string | null; issue_date: string | null; address_normalized: string | null }>(
          allAddresses,
          200,
          (chunk) =>
            supabase
              .from('permits')
              .select('permit_number, issue_date, address_normalized')
              .in('address_normalized', chunk)
              .gte('issue_date', weekCutoff)
              .limit(500),
          (row) => `${row.permit_number ?? ''}|${row.address_normalized}|${row.issue_date}`
        ),
      ])

      for (const c of (complaintsRes.data ?? []) as Array<{
        sr_type: string | null
        sr_short_code: string | null
        created_date: string | null
        address_normalized: string | null
        standard_description: string | null
      }>) {
        weekComplaintsTotal++
        const code = (c.sr_short_code ?? '').toUpperCase()
        if (code && BUILDING_CODE_SET.has(code)) {
          weekComplaintsBuilding++
          if (!weekMostRecentBuilding && c.created_date && c.address_normalized) {
            const meta = addressToProperty.get(c.address_normalized)
            weekMostRecentBuilding = {
              sr_type: c.sr_type ?? 'Complaint',
              date: c.created_date,
              property_display: meta?.display ?? c.address_normalized,
              standard_description: c.standard_description?.trim() || null,
            }
          }
        }
      }

      // Violations: dedupe by inspection_number for "fresh" count
      const violationInspections = new Set<string>()
      for (const v of (violationsRes.data ?? []) as Array<{
        inspection_number: string | null
        is_stop_work_order: boolean | null
      }>) {
        if (v.inspection_number) {
          if (!violationInspections.has(v.inspection_number)) {
            weekViolationsTotal++
            violationInspections.add(v.inspection_number)
          }
        } else {
          weekViolationsTotal++
        }
        if (v.is_stop_work_order) weekStopWorks++
      }

      // Permits: dedupe by permit_number
      const permitNumbers = new Set<string>()
      for (const p of (permitsRes.data ?? []) as Array<{ permit_number: string | null }>) {
        if (p.permit_number) {
          if (!permitNumbers.has(p.permit_number)) {
            weekPermitsTotal++
            permitNumbers.add(p.permit_number)
          }
        } else {
          weekPermitsTotal++
        }
      }
    }
  }

  // ─── Top 5 hottest properties by total building complaints (12mo) ──────
  const hottest = [...props]
    .filter((p) => (p.total_building_complaints_12mo ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.total_building_complaints_12mo ?? 0) - (a.total_building_complaints_12mo ?? 0)
    )
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      display: p.display_name || p.canonical_address,
      community_area: p.community_area,
      total_12mo: p.total_building_complaints_12mo ?? 0,
      open: p.open_building_complaints ?? 0,
    }))

  // ─── Neighborhood breakdown (top 8 + "other") ──────────────────────────
  const neighborhoodCounts: Record<string, number> = {}
  for (const p of props) {
    const k = p.community_area?.trim() || 'Unknown'
    neighborhoodCounts[k] = (neighborhoodCounts[k] ?? 0) + 1
  }
  const neighborhoodEntries = Object.entries(neighborhoodCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  // ─── Occupancy ─────────────────────────────────────────────────────────
  const occupiedCount = (statusCounts['Current'] ?? 0) + (statusCounts['Notice-Rented'] ?? 0)
  const occupancyRate = totalUnits > 0 ? occupiedCount / totalUnits : null

  // ─── Subscriber org for the modal title ────────────────────────────────
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('organization')
    .eq('clerk_id', userId)
    .maybeSingle()

  return NextResponse.json({
    organization: (subscriber?.organization as string | null) ?? null,
    headline: {
      total_buildings: totalProperties,
      total_units: totalUnits,
      gross_monthly_rent: Math.round(grossMonthlyRent),
      occupancy_rate: occupancyRate,
      occupied_count: occupiedCount,
    },
    this_week: {
      complaints_total: weekComplaintsTotal,
      complaints_building: weekComplaintsBuilding,
      violations_total: weekViolationsTotal,
      stop_works: weekStopWorks,
      permits_total: weekPermitsTotal,
      most_recent_building: weekMostRecentBuilding,
    },
    open: {
      building_complaints: openBuildingComplaints,
      buildings_with_open_complaints: buildingsWithOpenComplaints,
      violations: openViolations,
      buildings_with_open_violations: buildingsWithOpenViolations,
      stop_work_count: stopWorkCount,
    },
    banner: {
      most_recent_building_complaint: latestBuildingComplaint,
      total_building_complaints_12mo: totalBuildingComplaints12mo,
    },
    hottest_properties: hottest,
    neighborhoods: neighborhoodEntries,
    status_breakdown: statusCounts,
    tag_breakdown: tagCounts,
  })
}
