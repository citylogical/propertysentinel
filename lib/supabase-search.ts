import { supabase as _supabase, getSupabaseAdmin } from './supabase'

const supabase = typeof window === 'undefined' ? getSupabaseAdmin() : _supabase

export type ComplaintRow = {
  sr_number: string
  sr_short_code: string | null
  sr_type: string | null
  status: string | null
  owner_department: string | null
  origin: string | null
  created_date: string | null
  closed_date: string | null
  last_modified_date: string | null
  pin: string | null
  ward: string | number | null
  community_area: number | string | null
  address_normalized: string | null
}

export type PropertyRow = {
  address: string | null
  address_normalized: string | null
  pin: string | null
  pin10: string | null
  zip: string | null
  ward: string | null
  community_area: string | null
  property_class: string | null
  lat: number | null
  lng: number | null
  health_score: number | null
  mailing_name: string | null
  mailing_address: string | null
  tax_year: string | null
}

export type ParcelUniverseRow = {
  pin: string | null
  pin10: string | null
  tax_year: number | null
  class: string | null
  ward: string | null
  community_area_name: string | null
  community_area_num: string | null
  lat: number | null
  lng: number | null
  township_name: string | null
  neighborhood_code: string | null
  municipality_name: string | null
  school_elementary_name: string | null
  school_secondary_name: string | null
  tif_district_num: string | null
  walkability_score: number | null
  flood_fema_sfha: boolean | null
  ohare_noise_contour: boolean | null
}

export type PropertyCharsRow = {
  class?: string | null
  num_apartments?: number | null
  tax_year?: number | string | null
  community_area?: string | null
  ward?: string | null
  [key: string]: unknown
}

export type PropertyCharsResidentialRow = {
  year_built?: number | string | null
  building_sqft?: number | null
  land_sqft?: number | null
  num_bedrooms?: number | null
  num_rooms?: number | null
  num_full_baths?: number | null
  num_half_baths?: number | null
  num_fireplaces?: number | null
  type_of_residence?: string | null
  num_apartments?: number | null
  garage_size?: string | null
  garage_attached?: boolean | string | null
  basement_type?: string | null
  ext_wall_material?: string | null
  central_heating?: string | null
  central_air?: string | null
  attic_type?: string | null
  roof_material?: string | null
  construction_quality?: string | null
  single_v_multi_family?: string | null
  tax_year?: number | string | null
  [key: string]: unknown
}

export type PropertyCharsCondoRow = {
  year_built?: number | string | null
  building_sqft?: number | null
  unit_sqft?: number | null
  num_bedrooms?: number | null
  building_pins?: number | null
  building_non_units?: number | null
  bldg_is_mixed_use?: boolean | string | null
  is_parking_space?: boolean | null
  is_common_area?: boolean | null
  land_sqft?: number | null
  tax_year?: number | string | null
  [key: string]: unknown
}

export type ViolationRow = {
  address_normalized?: string | null
  violation_description: string | null
  violation_status: string | null
  violation_date: string | null
  violation_last_modified_date: string | null
  inspection_status: string | null
  inspection_category: string | null
  department_bureau: string | null
  violation_inspector_comments: string | null
  violation_ordinance: string | null
  inspection_number: string | null
  is_stop_work_order: boolean | null
}

export type PermitRow = {
  address_normalized?: string | null
  permit_type: string | null
  permit_status: string | null
  work_description: string | null
  issue_date: string | null
  permit_number: string | null
  is_roof_permit: boolean | null
}

export type AssessedValueRawRow = {
  tax_year: number | string | null
  class: string | null
  township_name: string | null
  neighborhood_code: string | null
  board_tot: number | null
  certified_tot: number | null
  mailed_tot: number | null
}

export type AssessedValueResult = {
  displayValue: number
  valueType: 'board' | 'certified' | 'mailed'
  taxYear: number
  class?: string | null
  township_name?: string | null
  neighborhood_code?: string | null
}

// ---------------------------------------------------------------------------
// PIN normalization
// ---------------------------------------------------------------------------

export function normalizePinSilent(pin: string): string {
  if (!pin || String(pin).trim() === '') return ''
  const digitsOnly = String(pin).trim().replace(/-/g, '').replace(/\D/g, '')
  if (!digitsOnly) return ''
  return digitsOnly.padStart(14, '0').slice(0, 14)
}

export function normalizePin(pin: string | null | undefined): string {
  const out = normalizePinSilent(pin ?? '')
  if (out && typeof console !== 'undefined' && console.log) {
    console.log('[property] Sanitized PIN:', JSON.stringify(out))
  }
  return out
}

// ---------------------------------------------------------------------------
// Address normalization
// ---------------------------------------------------------------------------

const DIRECTIONAL_ABBREV: [RegExp, string][] = [
  [/\bWEST\b/g, 'W'],
  [/\bEAST\b/g, 'E'],
  [/\bNORTH\b/g, 'N'],
  [/\bSOUTH\b/g, 'S'],
]

const STREET_TYPE_ABBREV: [RegExp, string][] = [
  [/\bSTREET\b/g, 'ST'],
  [/\bAVENUE\b/g, 'AVE'],
  [/\bBOULEVARD\b/g, 'BLVD'],
  [/\bDRIVE\b/g, 'DR'],
  [/\bCOURT\b/g, 'CT'],
  [/\bPLACE\b/g, 'PL'],
  [/\bLANE\b/g, 'LN'],
  [/\bROAD\b/g, 'RD'],
]

export function normalizeAddress(raw: string): string {
  let s = raw.trim()
  if (!s) return s
  s = (s.split(',')[0] ?? s).trim()
  s = s.replace(/\s+(apt|apartment|unit|#)\s*.*$/i, '').trim()
  s = s.replace(/\s+/g, ' ').trim()
  s = s.toUpperCase()
  for (const [re, repl] of DIRECTIONAL_ABBREV) s = s.replace(re, repl)
  for (const [re, repl] of STREET_TYPE_ABBREV) s = s.replace(re, repl)
  return s
}

// ---------------------------------------------------------------------------
// Sibling PIN resolution
// ---------------------------------------------------------------------------

export async function fetchSiblingPins(
  pin: string,
  addressNormalized: string
): Promise<{
  siblingPins: string[]
  siblingAddresses: string[]
  addressRange: string | null
  resolvedVia: 'address' | 'commercial' | 'mailing' | 'none'
}> {
  const supabaseAdmin = supabase
  const noSiblings = {
    siblingPins: [pin],
    siblingAddresses: [addressNormalized],
    addressRange: null,
    resolvedVia: 'none' as const,
  }

  try {
    // PATH A — multiple PINs share exact same address (condo tower)
    console.log('fetchSiblingPins entered, pin:', pin, 'address:', addressNormalized)
    const { data: sameAddress } = await supabaseAdmin
      .from('properties')
      .select('pin, address_normalized')
      .eq('address_normalized', addressNormalized)

    if (sameAddress && sameAddress.length > 1) {
      const pins = sameAddress.map((r: any) => r.pin).filter(Boolean) as string[]
      const addresses = [...new Set(sameAddress.map((r: any) => r.address_normalized).filter(Boolean))] as string[]
      const range = buildAddressRange(addresses) ?? (pins.length > 1 ? `${addresses[0]} (${pins.length} parcels)` : null)
      return {
        siblingPins: pins,
        siblingAddresses: addresses,
        addressRange: range,
        resolvedVia: 'address',
      }
    }

    // PATH B — commercial chars pins column
    // Does NOT return early — falls through to Path C which is authoritative
    const { data: commercial } = await supabaseAdmin
      .from('property_chars_commercial')
      .select('keypin, pins')
      .or(`keypin.eq.${pin},pins.ilike.%${pin.substring(0, 10)}%`)
      .order('tax_year', { ascending: false })
      .limit(1)

    // commercial result available if needed but Path C handles final resolution

    // PATH C — mailing name + same street (authoritative)
    const { data: subject } = await supabaseAdmin
      .from('properties')
      .select('mailing_name, address_normalized')
      .eq('pin', pin)
      .maybeSingle()
    console.log('Path C subject:', JSON.stringify(subject), 'pin queried:', pin)

    if (subject?.mailing_name && subject.mailing_name.trim() !== '') {
      const streetWords = addressNormalized.split(' ').slice(2).join(' ')
      const { data: siblings } = await supabaseAdmin
        .from('properties')
        .select('pin, address_normalized')
        .eq('mailing_name', subject.mailing_name)
        .ilike('address_normalized', `%${streetWords}%`)

      if (siblings && siblings.length > 0) {
        console.log('Path C siblings result:', JSON.stringify(siblings), 'streetWords:', streetWords)
        const mailingPins = siblings.map((r: any) => r.pin).filter(Boolean) as string[]
        const mailingAddresses = [...new Set(siblings.map((r: any) => r.address_normalized).filter(Boolean))] as string[]
        const allPins = [...new Set([pin, ...mailingPins])] as string[]
        const allAddresses = [...new Set([addressNormalized, ...mailingAddresses])] as string[]
        if (allAddresses.length > 1) {
          return {
            siblingPins: allPins,
            siblingAddresses: allAddresses,
            addressRange: buildAddressRange(allAddresses),
            resolvedVia: 'mailing',
          }
        }
      }
    }

    return noSiblings
  } catch (e) {
    console.log('fetchSiblingPins error:', e instanceof Error ? e.message : String(e))
    return noSiblings
  }
}

function buildAddressRange(addresses: string[]): string | null {
  if (addresses.length <= 1) return null

  const parsed = addresses.map(a => {
    const parts = a.trim().split(' ')
    const num = parseInt(parts[0])
    const rest = parts.slice(1).join(' ')
    return { num, street: rest }
  })

  const byStreet: Record<string, number[]> = {}
  for (const p of parsed) {
    if (!byStreet[p.street]) byStreet[p.street] = []
    byStreet[p.street].push(p.num)
  }

  const parts = Object.entries(byStreet).map(([street, nums]) => {
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    return min === max ? `${min} ${street}` : `${min}–${max} ${street}`
  })

  return parts.join(' & ')
}

// ---------------------------------------------------------------------------
// Property fetch
// ---------------------------------------------------------------------------

export async function fetchProperty(normalizedAddress: string): Promise<{
  property: PropertyRow | null
  nearestParcel: (PropertyRow & { _nearestDist: number }) | null
  error: string | null
}> {
  console.log('fetchProperty received:', JSON.stringify(normalizedAddress))
  const SELECT_COLS = 'address, address_normalized, pin, pin10, zip, ward, community_area, property_class, lat, lng, health_score, mailing_name, mailing_address, tax_year'

  try {
    // Tier 1 — exact match on address
    let { data, error } = await supabase
      .from('properties')
      .select(SELECT_COLS)
      .eq('address', normalizedAddress)
      .order('pin', { ascending: true })
      .limit(1)
      .maybeSingle()

    // Tier 2 — strip street type suffix, prefix LIKE (btree-safe, data is already uppercase)
    // Handles slug/data street-type mismatches e.g. slug says "Drive" but data has "Street"
    if (!data && !error) {
      const withoutSuffix = normalizedAddress.replace(/\s+(ST|AVE|BLVD|DR|CT|PL|LN|RD|WAY|PKWY|TER|CIR)$/i, '')
      const fallback = await supabase
        .from('properties')
        .select(SELECT_COLS)
        .like('address', `${withoutSuffix}%`)  // LIKE not ILIKE — ILIKE prevents btree index use
        .order('pin', { ascending: true })
        .limit(1)
        .maybeSingle()
      data = fallback.data
      error = fallback.error
    }

    if (error) throw new Error(error.message)

    if (data) {
      console.log('fetchProperty result:', JSON.stringify(data))
      return { property: data as PropertyRow, nearestParcel: null, error: null }
    }

    // Tier 3 — direction-agnostic nearest-number search
    // Handles two known failure modes:
    //   (a) Direction mismatch: Assessor stores "5532 E HYDE PARK BLVD",
    //       DOB writes "5540 S HYDE PARK BLVD" — diagonal streets use E vs S interchangeably
    //   (b) Address range: Assessor stores only the low address (5532),
    //       DOB inspector walked in at 5540
    //   (c) Both combined
    //
    // Returns nearestParcel for the UI hint banner ONLY.
    // Does NOT set `property` — the page shows N/A for PIN/assessor fields
    // and surfaces a soft banner instead of asserting this is the same building.
    //
    // Uses .in() on all candidate addresses — fast on indexed column, no leading wildcards.
    let nearestParcel: (PropertyRow & { _nearestDist: number }) | null = null

    const addressParts = normalizedAddress.split(' ')
    const streetNum = parseInt(addressParts[0])
    const hasDirection = addressParts.length >= 3 && /^[NSEW]$/.test(addressParts[1])
    const streetSuffix = hasDirection
      ? addressParts.slice(2).join(' ')
      : addressParts.slice(1).join(' ')

    if (!isNaN(streetNum) && streetSuffix.length > 2) {
      const directions = ['N', 'S', 'E', 'W']
      // Offset 0 first (same number, different direction), then step outward by 2s up to ±10
      const stepOffsets = [0, -2, 2, -4, 4, -6, 6, -8, 8, -10, 10]

      const candidates: string[] = []
      for (const offset of stepOffsets) {
        const num = streetNum + offset
        if (num <= 0) continue
        for (const dir of directions) {
          candidates.push(`${num} ${dir} ${streetSuffix}`)
        }
      }

      const { data: nearbyData } = await supabase
        .from('properties')
        .select(SELECT_COLS)
        .in('address_normalized', candidates)
        .limit(10)

      if (nearbyData && nearbyData.length > 0) {
        const closest = (nearbyData as PropertyRow[])
          .map((r) => {
            const num = parseInt((r.address_normalized ?? r.address ?? '').split(' ')[0])
            return { ...r, _nearestDist: isNaN(num) ? 9999 : Math.abs(num - streetNum) }
          })
          .sort((a, b) => a._nearestDist - b._nearestDist)[0]

        // Cap at 10 street numbers to avoid false positives on dense blocks
        if (closest._nearestDist <= 10) {
          nearestParcel = closest
        }
      }
    }

    console.log('fetchProperty: no match, nearestParcel:', nearestParcel?.address_normalized ?? 'none')
    return { property: null, nearestParcel, error: null }
  } catch (e) {
    return {
      property: null,
      nearestParcel: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// Parcel universe
// ---------------------------------------------------------------------------

export async function fetchParcelUniverse(pin: string): Promise<{
  parcel: ParcelUniverseRow | null
  error: string | null
}> {
  if (!pin || !normalizePinSilent(pin)) return { parcel: null, error: null }
  const pinQuery = normalizePinSilent(pin)
  try {
    const { data, error } = await supabase
      .from('parcel_universe')
      .select('pin, pin10, tax_year, class, ward, community_area_name, community_area_num, lat, lng, township_name, neighborhood_code, municipality_name, school_elementary_name, school_secondary_name, tif_district_num, walkability_score, flood_fema_sfha, ohare_noise_contour')
      .eq('pin', pinQuery)
      .order('tax_year', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)

    return { parcel: (data as ParcelUniverseRow | null) ?? null, error: null }
  } catch (e) {
    return {
      parcel: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

export async function fetchComplaints(normalizedAddress: string): Promise<{
  complaints: ComplaintRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('complaints_311')
      .select('sr_number, sr_short_code, sr_type, status, owner_department, origin, created_date, closed_date, last_modified_date, pin, ward, community_area, address_normalized')
      .eq('address_normalized', normalizedAddress)
      .order('created_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { complaints: (data as ComplaintRow[]) ?? [], error: null }
  } catch (e) {
    return {
      complaints: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchComplaintsByPin(pin: string): Promise<{
  complaints: ComplaintRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('complaints_311')
      .select('sr_number, sr_short_code, sr_type, status, owner_department, origin, created_date, closed_date, last_modified_date, pin, ward, community_area, address_normalized')
      .eq('pin', pin)
      .order('created_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { complaints: (data as ComplaintRow[]) ?? [], error: null }
  } catch (e) {
    return {
      complaints: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchComplaintsByAddresses(addresses: string[]): Promise<{
  complaints: ComplaintRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('complaints_311')
      .select('sr_number, sr_short_code, sr_type, status, owner_department, origin, created_date, closed_date, last_modified_date, pin, ward, community_area, address_normalized')
      .in('address_normalized', addresses)
      .order('created_date', { ascending: false })

    if (error) throw new Error(error.message)

    // Deduplicate on sr_number
    const seen = new Set<string>()
    const deduped = ((data ?? []) as ComplaintRow[]).filter(c => {
      if (!c.sr_number || seen.has(c.sr_number)) return false
      seen.add(c.sr_number)
      return true
    })

    return { complaints: deduped, error: null }
  } catch (e) {
    return {
      complaints: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// Violations
// ---------------------------------------------------------------------------

export async function fetchViolations(addressNormalized: string): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('address_normalized, violation_description, violation_status, violation_date, violation_last_modified_date, inspection_status, inspection_category, department_bureau, violation_inspector_comments, violation_ordinance, inspection_number, is_stop_work_order')
      .eq('address_normalized', addressNormalized)
      .order('violation_date', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)

    return { violations: (data ?? []) as ViolationRow[], error: null }
  } catch (e) {
    return {
      violations: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchViolationsByPin(pin: string): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('address_normalized, violation_description, violation_status, violation_date, violation_last_modified_date, inspection_status, inspection_category, department_bureau, violation_inspector_comments, violation_ordinance, inspection_number, is_stop_work_order')
      .eq('pin', pin)
      .order('violation_date', { ascending: false })
      .limit(100)

    if (error) throw new Error(error.message)

    return { violations: (data ?? []) as ViolationRow[], error: null }
  } catch (e) {
    return {
      violations: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchViolationsByAddresses(addresses: string[]): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('address_normalized, violation_description, violation_status, violation_date, violation_last_modified_date, inspection_status, inspection_category, department_bureau, violation_inspector_comments, violation_ordinance, inspection_number, is_stop_work_order')
      .in('address_normalized', addresses)
      .order('violation_date', { ascending: false })
      .limit(200)

    if (error) throw new Error(error.message)

    return { violations: (data ?? []) as ViolationRow[], error: null }
  } catch (e) {
    return {
      violations: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// Permits
// ---------------------------------------------------------------------------

export async function fetchPermits(normalizedAddress: string): Promise<{
  permits: PermitRow[]
  error: string | null
}> {
  try {
    const pattern = `${normalizedAddress}%`
    const { data, error } = await supabase
      .from('permits')
      .select('address_normalized, permit_type, permit_status, work_description, issue_date, permit_number, is_roof_permit')
      .ilike('address_normalized', pattern)
      .order('issue_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { permits: (data as PermitRow[]) ?? [], error: null }
  } catch (e) {
    return {
      permits: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchPermitsByPin(pin: string): Promise<{
  permits: PermitRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('permits')
      .select('address_normalized, permit_type, permit_status, work_description, issue_date, permit_number, is_roof_permit')
      .eq('pin', pin)
      .order('issue_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { permits: (data as PermitRow[]) ?? [], error: null }
  } catch (e) {
    return {
      permits: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchPermitsByAddresses(addresses: string[]): Promise<{
  permits: PermitRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('permits')
      .select('address_normalized, permit_type, permit_status, work_description, issue_date, permit_number, is_roof_permit')
      .in('address_normalized', addresses)
      .order('issue_date', { ascending: false })

    if (error) throw new Error(error.message)

    return { permits: (data as PermitRow[]) ?? [], error: null }
  } catch (e) {
    return {
      permits: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// Property characteristics
// ---------------------------------------------------------------------------

const RESIDENTIAL_COLS =
  'year_built,building_sqft,land_sqft,num_bedrooms,num_rooms,num_full_baths,num_half_baths,num_fireplaces,type_of_residence,num_apartments,garage_size,garage_attached,basement_type,ext_wall_material,central_heating,central_air,attic_type,roof_material,construction_quality,single_v_multi_family,tax_year'
const CONDO_COLS =
  'year_built,building_sqft,unit_sqft,num_bedrooms,building_pins,building_non_units,bldg_is_mixed_use,is_parking_space,is_common_area,land_sqft,tax_year'

export async function fetchPropertyCharsResidential(pin: string): Promise<{
  chars: PropertyCharsResidentialRow | null
  error: string | null
}> {
  if (!pin || !normalizePinSilent(pin)) return { chars: null, error: null }
  const pinQuery = normalizePinSilent(pin)
  try {
    const { data, error } = await supabase
      .from('property_chars_residential')
      .select(RESIDENTIAL_COLS)
      .eq('pin', pinQuery)
      .order('tax_year', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return { chars: (data as PropertyCharsResidentialRow | null) ?? null, error: null }
  } catch (e) {
    return {
      chars: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchPropertyCharsCondo(pin: string): Promise<{
  chars: PropertyCharsCondoRow | null
  error: string | null
}> {
  if (!pin || !normalizePinSilent(pin)) return { chars: null, error: null }
  const pinQuery = normalizePinSilent(pin)
  try {
    const { data, error } = await supabase
      .from('property_chars_condo')
      .select(CONDO_COLS)
      .eq('pin', pinQuery)
      .eq('is_parking_space', false)
      .eq('is_common_area', false)
      .order('tax_year', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return { chars: (data as PropertyCharsCondoRow | null) ?? null, error: null }
  } catch (e) {
    return {
      chars: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export async function fetchPropertyChars(pin: string): Promise<{
  chars: PropertyCharsRow | null
  error: string | null
}> {
  const [resResidential, resCondo] = await Promise.all([
    fetchPropertyCharsResidential(pin),
    fetchPropertyCharsCondo(pin),
  ])
  const residential = resResidential.chars
  const condo = resCondo.chars
  const chars = (residential ?? condo) as PropertyCharsRow | null
  return { chars, error: resResidential.error ?? resCondo.error }
}

// ---------------------------------------------------------------------------
// Assessed value
// ---------------------------------------------------------------------------

export async function fetchAssessedValue(pin: string | null | undefined): Promise<{
  assessed: AssessedValueResult | null
  error: string | null
}> {
  console.log('fetchAssessedValue called with:', JSON.stringify(pin))
  if (!pin || typeof pin !== 'string' || String(pin).trim() === '') {
    console.log('fetchAssessedValue: early return — null or empty pin')
    return { assessed: null, error: null }
  }
  const pinQuery = normalizePinSilent(pin)
  if (!pinQuery) {
    console.log('fetchAssessedValue: early return — normalizePinSilent returned empty')
    return { assessed: null, error: null }
  }

  console.log('Querying assessed_values with PIN:', pinQuery)

  try {
    const { data, error } = await supabase
      .from('assessed_values')
      .select('tax_year, class, township_name, neighborhood_code, board_tot, certified_tot, mailed_tot')
      .eq('pin', pinQuery)
      .order('tax_year', { ascending: false })
      .limit(10)

    console.log('assessed_values raw data:', JSON.stringify(data), 'error:', JSON.stringify(error))

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as AssessedValueRawRow[]

    const row = rows.find(r =>
      r.board_tot != null || r.certified_tot != null || r.mailed_tot != null
    ) ?? null

    if (row == null) return { assessed: null, error: null }

    const displayValue = row.board_tot ?? row.certified_tot ?? row.mailed_tot
    if (displayValue == null || !Number.isFinite(Number(displayValue))) {
      return { assessed: null, error: null }
    }

    const valueType: 'board' | 'certified' | 'mailed' =
      row.board_tot != null ? 'board' : row.certified_tot != null ? 'certified' : 'mailed'
    const taxYear =
      typeof row.tax_year === 'number'
        ? row.tax_year
        : parseInt(String(row.tax_year ?? ''), 10)

    if (!Number.isFinite(taxYear)) return { assessed: null, error: null }

    return {
      assessed: {
        displayValue: Number(displayValue),
        valueType,
        taxYear,
        class: row.class ?? null,
        township_name: row.township_name ?? null,
        neighborhood_code: row.neighborhood_code ?? null,
      },
      error: null,
    }
  } catch (e) {
    console.log('fetchAssessedValue error:', e instanceof Error ? e.message : String(e))
    return {
      assessed: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export type AssessedValueByPinRow = {
  pin: string
  assessedValue: number | null
  assessedClass: string | null
  taxYear: number | null
  valueType: string | null
}

/** One result per PIN: most recent row with board → certified → mailed priority (same as fetchAssessedValue). */
export async function fetchAssessedValuesByPins(pins: string[]): Promise<{
  results: AssessedValueByPinRow[]
  error: string | null
}> {
  if (!pins?.length) return { results: [], error: null }
  try {
    const results: AssessedValueByPinRow[] = await Promise.all(
      pins.map(async (p) => {
        const pinQuery = normalizePinSilent(p)
        const empty: AssessedValueByPinRow = {
          pin: p,
          assessedValue: null,
          assessedClass: null,
          taxYear: null,
          valueType: null,
        }
        if (!pinQuery) return empty

        const { data, error } = await supabase
          .from('assessed_values')
          .select('tax_year, class, board_tot, certified_tot, mailed_tot')
          .eq('pin', pinQuery)
          .order('tax_year', { ascending: false })
          .limit(10)

        if (error) throw new Error(error.message)
        const rows = (data ?? []) as AssessedValueRawRow[]
        const row =
          rows.find((r) => r.board_tot != null || r.certified_tot != null || r.mailed_tot != null) ?? null
        if (!row) return empty

        const displayValue = row.board_tot ?? row.certified_tot ?? row.mailed_tot
        if (displayValue == null || !Number.isFinite(Number(displayValue))) return empty

        const valueType: 'board' | 'certified' | 'mailed' =
          row.board_tot != null ? 'board' : row.certified_tot != null ? 'certified' : 'mailed'
        const taxYear =
          typeof row.tax_year === 'number' ? row.tax_year : parseInt(String(row.tax_year ?? ''), 10)
        if (!Number.isFinite(taxYear)) return empty

        return {
          pin: p,
          assessedValue: Number(displayValue),
          assessedClass: row.class ?? null,
          taxYear,
          valueType,
        }
      })
    )
    return { results, error: null }
  } catch (e) {
    return {
      results: pins.map((p) => ({
        pin: p,
        assessedValue: null,
        assessedClass: null,
        taxYear: null,
        valueType: null,
      })),
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

export type AssessedValueSumResult = {
  totalValue: number | null
  taxYear: number | null
  valueType: string | null
  error: string | null
}

/**
 * Sum assessed values across multiple PINs (most recent row per PIN, same priority as fetchAssessedValue).
 * Returns most common tax year and value type across contributing parcels.
 */
export async function fetchAssessedValueSum(pins: string[]): Promise<AssessedValueSumResult> {
  if (!pins?.length) {
    return { totalValue: null, taxYear: null, valueType: null, error: null }
  }
  const normalizedPins = [...new Set(pins.map((p) => normalizePinSilent(p)).filter(Boolean))]
  if (!normalizedPins.length) {
    return { totalValue: null, taxYear: null, valueType: null, error: null }
  }

  try {
    const perPin = await Promise.all(
      normalizedPins.map(async (pinQuery) => {
        const { data, error } = await supabase
          .from('assessed_values')
          .select('tax_year, board_tot, certified_tot, mailed_tot')
          .eq('pin', pinQuery)
          .order('tax_year', { ascending: false })
          .limit(10)

        if (error) throw new Error(error.message)
        const rows = (data ?? []) as AssessedValueRawRow[]
        const row =
          rows.find((r) => r.board_tot != null || r.certified_tot != null || r.mailed_tot != null) ?? null
        if (!row) return null
        const displayValue = row.board_tot ?? row.certified_tot ?? row.mailed_tot
        if (displayValue == null || !Number.isFinite(Number(displayValue))) return null
        const valueType: 'board' | 'certified' | 'mailed' =
          row.board_tot != null ? 'board' : row.certified_tot != null ? 'certified' : 'mailed'
        const taxYear =
          typeof row.tax_year === 'number' ? row.tax_year : parseInt(String(row.tax_year ?? ''), 10)
        if (!Number.isFinite(taxYear)) return null
        return { value: Number(displayValue), taxYear, valueType }
      })
    )

    const valid = perPin.filter((r): r is NonNullable<typeof r> => r != null)
    if (!valid.length) {
      return { totalValue: null, taxYear: null, valueType: null, error: null }
    }

    const totalValue = valid.reduce((s, r) => s + r.value, 0)
    const taxYearCounts = new Map<number, number>()
    const typeCounts = new Map<string, number>()
    for (const r of valid) {
      taxYearCounts.set(r.taxYear, (taxYearCounts.get(r.taxYear) ?? 0) + 1)
      typeCounts.set(r.valueType, (typeCounts.get(r.valueType) ?? 0) + 1)
    }
    const taxYear =
      [...taxYearCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null
    const valueType =
      [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return { totalValue, taxYear, valueType, error: null }
  } catch (e) {
    return {
      totalValue: null,
      taxYear: null,
      valueType: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}

/** Map normalized PIN → address_normalized for building expanded view. */
export async function fetchPinAddressMap(pins: string[]): Promise<Record<string, string>> {
  const normalized = [...new Set(pins.map((p) => normalizePinSilent(p)).filter(Boolean))]
  if (!normalized.length) return {}
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('pin, address_normalized')
      .in('pin', normalized)
    if (error || !data) return {}
    const map: Record<string, string> = {}
    for (const row of data as { pin: string | null; address_normalized: string | null }[]) {
      if (row.pin && row.address_normalized) {
        map[normalizePinSilent(row.pin)] = row.address_normalized
      }
    }
    return map
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Commercial characteristics
// ---------------------------------------------------------------------------

export async function fetchCommercialChars(pin: string): Promise<{
  chars: any[]
  error: string | null
}> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('property_chars_commercial')
      .select('keypin, tax_year, sheet, class, property_type_use, year_built, building_sqft, land_sqft, noi, caprate, final_market_value, income_market_value, adj_rent_sf, investment_rating')
      .eq('keypin', pin)
      .order('tax_year', { ascending: false })
      .order('sheet', { ascending: true })
    if (error) throw new Error(error.message)
    return { chars: data ?? [], error: null }
  } catch (e) {
    return { chars: [], error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ---------------------------------------------------------------------------
// Tax exempt characteristics
// ---------------------------------------------------------------------------

export async function fetchExemptChars(pin: string): Promise<{
  exempt: any | null
  error: string | null
}> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('property_tax_exempt')
      .select('pin, tax_year, owner_name, owner_num, class, property_address, township_name')
      .eq('pin', pin)
      .order('tax_year', { ascending: false })
      .limit(1)
      .single()
    if (error && error.code !== 'PGRST116') throw new Error(error.message)
    return { exempt: data ?? null, error: null }
  } catch (e) {
    return { exempt: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}