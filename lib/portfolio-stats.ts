import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_VISIBLE_CODES } from '@/lib/sr-codes'

/**
 * Run a Supabase select-with-.in() in chunks and concatenate the results.
 *
 * The native PostgREST .in() filter encodes its values into the URL query
 * string. After the Hansen backfill widened portfolio_properties address
 * sets, a single .in('address_normalized', allAddresses) for a 351-row
 * portfolio could produce a URL well over PostgREST's 8KB gateway limit,
 * causing the underlying node-fetch to throw "TypeError: fetch failed".
 *
 * This helper splits the values array into chunks of `chunkSize`, runs each
 * chunk in parallel via the buildQuery factory, concats results, and
 * deduplicates by `dedupeKey`. Pass a builder factory (not a built query)
 * because Supabase query builders mutate when chained — we need a fresh
 * builder per chunk.
 *
 * `chunkSize` defaults to 200. Each normalized address averages ~25 chars
 * which encodes to ~5KB per chunk URL, leaving ~3KB headroom under the 8KB
 * gateway limit.
 *
 * TODO: Replace with Supabase stored functions (get_portfolio_complaints /
 * _violations / _permits) that take addresses as a text[] parameter — those
 * have fixed-size POST bodies and don't have this URL-length vulnerability.
 * Tracked in the technical scope doc as an architectural follow-up.
 */
export async function chunkedIn<T extends Record<string, unknown>>(
  values: string[],
  chunkSize: number,
  buildQuery: (chunk: string[]) => PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>,
  dedupeKey?: (row: T) => string
): Promise<{ data: T[]; error: string | null }> {
  if (values.length === 0) return { data: [], error: null }

  const chunks: string[][] = []
  for (let i = 0; i < values.length; i += chunkSize) {
    chunks.push(values.slice(i, i + chunkSize))
  }

  const results = await Promise.all(chunks.map(buildQuery))
  const errored = results.find((r) => r.error)
  if (errored?.error) return { data: [], error: errored.error.message }

  const merged: T[] = []
  for (const r of results) {
    if (r.data) merged.push(...(r.data as T[]))
  }

  if (!dedupeKey) return { data: merged, error: null }

  const seen = new Set<string>()
  const deduped: T[] = []
  for (const row of merged) {
    const key = dedupeKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }
  return { data: deduped, error: null }
}

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

  // Street name aliases — legacy ↔ modern forms used inconsistently across datasets.
  // Assessor (properties) uses "S Park Ave" for MLK; 311/violations/permits use the
  // modern honorific "S Dr Martin Luther King Jr Dr". Without expansion, activity counts
  // silently zero for portfolio rows on these streets even after the PIN resolves.
  const STREET_ALIASES: Array<[RegExp, string[]]> = [
    [/ S KING DR$/, [' S S PARK AVE', ' S DR MARTIN LUTHER KING JR DR']],
    [/ S S PARK AVE$/, [' S KING DR', ' S DR MARTIN LUTHER KING JR DR']],
    [/ S DR MARTIN LUTHER KING JR DR$/, [' S KING DR', ' S S PARK AVE']],
  ]
  const expanded = new Set(addrs)
  for (const addr of addrs) {
    for (const [pattern, replacements] of STREET_ALIASES) {
      if (pattern.test(addr)) {
        for (const replacement of replacements) {
          expanded.add(addr.replace(pattern, replacement))
        }
      }
    }
  }
  expanded.delete('')
  return Array.from(expanded)
}

export interface PortfolioActivityStats {
  open_complaints: number
  total_complaints_12mo: number
  open_building_complaints: number
  total_building_complaints_12mo: number
  latest_building_complaint_date: string | null
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
  additionalStreets: string[] | null | undefined,
  pins?: string[] | null | undefined,
  opts?: { skipStr?: boolean }
): Promise<PortfolioActivityDetail> {
  const skipStr = opts?.skipStr === true
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
            .select('violation_status, inspection_status, is_stop_work_order, violation_date')
            .eq('address_normalized', addr)
            .limit(500)
            .then((r) => r.data ?? [])
        )
      ),
      skipStr
        ? Promise.resolve([] as boolean[])
        : Promise.all(
            addresses.map((addr) =>
              supabase
                .from('str_prohibited_buildings')
                .select('application_id', { count: 'exact', head: true })
                .eq('address_normalized', addr)
                .then((r) => (r.count ?? 0) > 0)
            )
          ),
      skipStr
        ? Promise.resolve([] as number[])
        : Promise.all(
            addresses.map((addr) =>
              supabase
                .from('str_registrations')
                .select('registration_number', { count: 'exact', head: true })
                .eq('address_normalized', addr)
                .then((r) => r.count ?? 0)
            )
          ),
      (async () => {
        if (skipStr) return false
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
        if (skipStr) return 0
        // Use saved pins from portfolio_properties when available — skips the
        // broken address→properties.pin lookup that fails for condo buildings
        // where properties is keyed per-unit (e.g. "2413 W HADDON AVE 1") but
        // canonical_address is building-level (e.g. "2413 W HADDON AVE").
        const candidatePins: string[] = []
        if (pins && pins.length > 0) {
          for (const p of pins) {
            const trimmed = p?.trim()
            if (trimmed) candidatePins.push(trimmed)
          }
        }
        // Fallback path for backward compatibility — when caller didn't pass pins
        if (candidatePins.length === 0) {
          for (const addr of addresses) {
            const { data: propRow } = await supabase
              .from('properties')
              .select('pin')
              .eq('address_normalized', addr)
              .limit(1)
              .maybeSingle()
            if (propRow?.pin) {
              candidatePins.push(String(propRow.pin).trim())
              break
            }
          }
        }
        if (candidatePins.length === 0) return 0

        // Use ONLY the first PIN as the coordinate anchor for the nearby-listings
        // bbox. Previously this iterated up to all PINs looking for one with
        // valid coords — meaningful work on rows like 175 E DELAWARE PL (711 PINs)
        // or 1720 S MICHIGAN AVE (965 PINs) where Hansen resolved a giant condo
        // tower. For those rows we'd hit parcel_universe up to 711 times to
        // anchor a single bbox query.
        //
        // pins[0] is almost always the building's primary parcel and almost
        // always has lat/lng. Deliberate trade: rows whose first PIN happens to
        // be coord-less (rare — airport catch-all and similar) return
        // nearby_listings: 0. nearby_listings is a deliberately-cached STR
        // metric refreshed only by import-rentroll/rederive-buildings, not the
        // live route — so an occasional 0 on a coord-less primary parcel is a
        // tolerable miss for the speed win on the hot path.
        const primaryPin = candidatePins[0]
        const { data: parcel } = await supabase
          .from('parcel_universe')
          .select('lat, lng')
          .eq('pin', primaryPin)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('tax_year', { ascending: false })
          .limit(1)
          .maybeSingle()
        const lat = parcel?.lat != null ? Number(parcel.lat) : NaN
        const lng = parcel?.lng != null ? Number(parcel.lng) : NaN
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0

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
  const oneYearAgoIso = new Date(Date.now() - 365 * 86400000).toISOString()
  let hasStopWork = false
  for (const batch of openViolResults) {
    for (const v of batch) {
      if (isViolationOpenOrFailed(v)) totalOpenViolations++
      const row = v as {
        is_stop_work_order?: boolean | null
        violation_status?: string | null
        inspection_status?: string | null
        violation_date?: string | null
      }
      if (!row.is_stop_work_order) continue
      const status = String(row.violation_status ?? row.inspection_status ?? '').toUpperCase()
      const isOpen = status === 'OPEN' || status === 'FAILED'
      if (!isOpen) continue
      const vd = row.violation_date
      if (!vd) continue
      if (vd >= oneYearAgoIso) hasStopWork = true
    }
  }

  const isPbl = pblResults.some((found) => found)
  const strRegistrations = strRegResults.reduce((sum, count) => sum + count, 0)

  // allComplaints is already filtered to DEFAULT_VISIBLE_CODES (building/business/etc)
  const openBuildingComplaints = allComplaints.filter(
    (c) => String((c as { status?: string }).status ?? '').toLowerCase() === 'open'
  ).length
  const totalBuildingComplaints12mo = allComplaints.length

  // Total count: all complaints regardless of code
  const allComplaintsUnfiltered = allComplaintsRaw
  const openComplaints = allComplaintsUnfiltered.filter(
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

  // Latest building complaint timestamp — for the dashboard "Latest bldg" column.
  // Uses the same DEFAULT_VISIBLE_CODES–filtered set as open/total building complaint counts.
  let latest_building_complaint_date: string | null = null
  for (const c of allComplaints) {
    const dateStr = (c as { created_date?: string | null }).created_date
    if (!dateStr) continue
    if (latest_building_complaint_date == null || dateStr > latest_building_complaint_date) {
      latest_building_complaint_date = dateStr
    }
  }

  return {
    recent_complaints,
    recent_violations,
    recent_permits,
    stats: {
      open_complaints: openComplaints,
      total_complaints_12mo: allComplaintsUnfiltered.length,
      open_building_complaints: openBuildingComplaints,
      total_building_complaints_12mo: totalBuildingComplaints12mo,
      latest_building_complaint_date,
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
