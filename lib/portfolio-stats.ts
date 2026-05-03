import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_VISIBLE_CODES } from '@/lib/sr-codes'

/**
 * Expand display-formatted address ranges into individual normalized addresses.
 * Handles em dashes, en dashes, and regular hyphens.
 */
function expandRange(segment: string): string[] {
  let s = segment
    .trim()
    .toUpperCase()
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')

  const suffixes: [RegExp, string][] = [
    [/\bSTREET\b/g, 'ST'],
    [/\bAVENUE\b/g, 'AVE'],
    [/\bBOULEVARD\b/g, 'BLVD'],
    [/\bDRIVE\b/g, 'DR'],
    [/\bCOURT\b/g, 'CT'],
    [/\bPLACE\b/g, 'PL'],
    [/\bLANE\b/g, 'LN'],
    [/\bROAD\b/g, 'RD'],
    [/\bWEST\b/g, 'W'],
    [/\bEAST\b/g, 'E'],
    [/\bNORTH\b/g, 'N'],
    [/\bSOUTH\b/g, 'S'],
  ]
  const normalize = (a: string) => {
    let r = a.trim().toUpperCase()
    for (const [p, rep] of suffixes) r = r.replace(p, rep)
    return r.replace(/\s+/g, ' ').trim()
  }

  const m = s.match(/^(\d+)\s*-\s*(\d+)\s+(.+)$/)
  if (m) {
    const low = parseInt(m[1], 10)
    const high = parseInt(m[2], 10)
    const street = normalize(m[3])
    const parity = low % 2
    const results: string[] = []
    for (let n = low; n <= high; n++) {
      if (n % 2 === parity) results.push(`${n} ${street}`)
    }
    return results
  }
  return [normalize(s)]
}

export function getAllAddresses(
  canonicalAddress: string,
  addressRange: string | null | undefined,
  additionalStreets: string[] | null | undefined
): string[] {
  const addrs = new Set<string>()
  addrs.add(canonicalAddress.toUpperCase().replace(/\s+/g, ' ').trim())

  if (addressRange) {
    for (const part of addressRange.split('&')) {
      for (const a of expandRange(part)) addrs.add(a)
    }
  }

  if (additionalStreets) {
    for (const s of additionalStreets) {
      if (s?.trim()) {
        for (const part of s.split('&')) {
          for (const a of expandRange(part)) addrs.add(a)
        }
      }
    }
  }

  addrs.delete('')
  return Array.from(addrs)
}

export interface PortfolioActivityStats {
  open_complaints: number
  total_complaints_12mo: number
  open_violations: number
  total_violations_12mo: number
  total_permits_12mo: number
  shvr_count: number
  is_pbl: boolean
  has_stop_work: boolean
  str_registrations: number
  is_restricted_zone: boolean
  nearby_listings: number
}

export interface PortfolioActivityDetail {
  recent_complaints: Record<string, unknown>[]
  recent_violations: Record<string, unknown>[]
  recent_permits: Record<string, unknown>[]
  stats: PortfolioActivityStats
}

function isViolationOpenOrFailed(v: {
  violation_status?: string | null
  inspection_status?: string | null
}): boolean {
  const s = (v.violation_status ?? v.inspection_status ?? '').toUpperCase()
  return s === 'OPEN' || s === 'FAILED'
}

function sortByIsoDateDesc(rows: Record<string, unknown>[], key: string): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const ta = new Date(String(a[key] ?? '')).getTime()
    const tb = new Date(String(b[key] ?? '')).getTime()
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}

/**
 * Fetch recent activity and compute stats for a portfolio property.
 */
export async function fetchPortfolioActivity(
  supabase: SupabaseClient,
  canonicalAddress: string,
  addressRange: string | null | undefined,
  additionalStreets: string[] | null | undefined
): Promise<PortfolioActivityDetail> {
  const addresses = getAllAddresses(canonicalAddress, addressRange, additionalStreets)
  const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString()

  const [
    complaintResults,
    violationResults,
    permitResults,
    openViolResults,
    pblResults,
    strRegResults,
    isRestrictedZone,
    nearbyListings,
  ] = await Promise.all([
      Promise.all(
        addresses.map((addr) =>
          supabase
            .from('complaints_311')
            .select('sr_number, sr_type, sr_short_code, status, created_date, closed_date, address_normalized, standard_description, trade_category, urgency_tier, sla_target_days, actual_mean_days, workflow_step, complaint_description, complainant_type, unit_number, danger_reported, owner_notified, owner_occupied, concern_category, problem_category, restaurant_name, business_name, work_order_steps, final_outcome, work_order_status')
            .eq('address_normalized', addr)
            .gte('created_date', twelveMonthsAgo)
            .order('created_date', { ascending: false })
            .limit(100)
            .then((r) => r.data ?? [])
        )
      ),
      Promise.all(
        addresses.map((addr) =>
          supabase
            .from('violations')
            .select(
              'violation_id, violation_status, violation_date, violation_description, inspection_category, department_bureau, inspection_status, inspection_number, is_stop_work_order, address_normalized'
            )
            .eq('address_normalized', addr)
            .gte('violation_date', twelveMonthsAgo)
            .order('violation_date', { ascending: false })
            .limit(100)
            .then((r) => r.data ?? [])
        )
      ),
      Promise.all(
        addresses.map((addr) =>
          supabase
            .from('permits')
            .select(
              'permit_number, permit_type, issue_date, reported_cost, total_fee, work_description, address_normalized'
            )
            .eq('address_normalized', addr)
            .gte('issue_date', twelveMonthsAgo)
            .order('issue_date', { ascending: false })
            .limit(100)
            .then((r) => r.data ?? [])
        )
      ),
      Promise.all(
        addresses.map((addr) =>
          supabase
            .from('violations')
            .select('violation_status, inspection_status, is_stop_work_order')
            .eq('address_normalized', addr)
            .limit(500)
            .then((r) => r.data ?? [])
        )
      ),
      Promise.all(
        addresses.map((addr) =>
          supabase
            .from('str_prohibited_buildings')
            .select('application_id', { count: 'exact', head: true })
            .eq('address_normalized', addr)
            .then((r) => (r.count ?? 0) > 0)
        )
      ),
      Promise.all(
        addresses.map((addr) =>
          supabase
            .from('str_registrations')
            .select('registration_number', { count: 'exact', head: true })
            .eq('address_normalized', addr)
            .then((r) => r.count ?? 0)
        )
      ),
      (async () => {
        const precinctHits = await Promise.all(
          addresses.map((addr) =>
            supabase
              .from('complaints_311')
              .select('ward, precinct')
              .eq('address_normalized', addr)
              .not('precinct', 'is', null)
              .not('ward', 'is', null)
              .limit(1)
              .then((r) => r.data?.[0] as { ward?: unknown; precinct?: unknown } | undefined)
          )
        )
        for (const row of precinctHits) {
          if (row?.ward != null && row?.precinct != null) {
            const { count } = await supabase
              .from('str_restricted_zones')
              .select('ward', { count: 'exact', head: true })
              .eq('ward', parseInt(String(row.ward), 10))
              .eq('precinct', parseInt(String(row.precinct), 10))
              .is('repeal_ordinance_effective_date', null)
            if ((count ?? 0) > 0) return true
          }
        }
        return false
      })(),
      (async () => {
        for (const addr of addresses) {
          const { data: propRow } = await supabase
            .from('properties')
            .select('pin')
            .eq('address_normalized', addr)
            .limit(1)
            .maybeSingle()
          if (propRow?.pin) {
            const { data: parcel } = await supabase
              .from('parcel_universe')
              .select('lat, lng')
              .eq('pin', String(propRow.pin).trim())
              .order('tax_year', { ascending: false })
              .limit(1)
              .maybeSingle()
            const lat = parcel?.lat != null ? Number(parcel.lat) : NaN
            const lng = parcel?.lng != null ? Number(parcel.lng) : NaN
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              const latDelta = 0.00135
              const lngDelta = 0.00185
              const { count } = await supabase
                .from('airbnb_listings')
                .select('id', { count: 'exact', head: true })
                .gte('latitude', lat - latDelta)
                .lte('latitude', lat + latDelta)
                .gte('longitude', lng - lngDelta)
                .lte('longitude', lng + lngDelta)
              return count ?? 0
            }
          }
        }
        return 0
      })(),
    ])

  const allComplaintsRaw = complaintResults.flat()
  const allComplaints = allComplaintsRaw.filter((c) => {
    const code = ((c as { sr_short_code?: string | null }).sr_short_code ?? '').toUpperCase()
    return DEFAULT_VISIBLE_CODES.has(code)
  })
  const allViolations12 = violationResults.flat()
  const allPermits = permitResults.flat()

  let totalOpenViolations = 0
  let hasStopWork = false
  for (const batch of openViolResults) {
    for (const v of batch) {
      if (isViolationOpenOrFailed(v)) totalOpenViolations++
      if (v.is_stop_work_order === true) hasStopWork = true
    }
  }

  const isPbl = pblResults.some((found) => found)
  const strRegistrations = strRegResults.reduce((sum, count) => sum + count, 0)

  const openComplaints = allComplaints.filter(
    (c) => String((c as { status?: string }).status ?? '').toLowerCase() === 'open'
  ).length
  const shvrCount = allComplaints.filter((c) => {
    const row = c as { sr_type?: string | null; sr_short_code?: string | null }
    const t = (row.sr_type ?? '').toUpperCase()
    const code = (row.sr_short_code ?? '').toUpperCase()
    return t.startsWith('SHVR') || code === 'SHVR'
  }).length

  const recent_complaints = sortByIsoDateDesc(allComplaints, 'created_date').slice(0, 50)
  const recent_violations = sortByIsoDateDesc(allViolations12, 'violation_date').slice(0, 50)
  const recent_permits = sortByIsoDateDesc(allPermits, 'issue_date').slice(0, 50)

  return {
    recent_complaints,
    recent_violations,
    recent_permits,
    stats: {
      open_complaints: openComplaints,
      total_complaints_12mo: allComplaints.length,
      open_violations: totalOpenViolations,
      total_violations_12mo: allViolations12.length,
      total_permits_12mo: allPermits.length,
      shvr_count: shvrCount,
      is_pbl: isPbl,
      has_stop_work: hasStopWork,
      str_registrations: strRegistrations,
      is_restricted_zone: isRestrictedZone,
      nearby_listings: nearbyListings,
    },
  }
}
