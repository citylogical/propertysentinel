import { unstable_cache } from 'next/cache'
import { supabase as _supabase, getSupabaseAdmin } from './supabase'
import { findManualBuilding } from './manual-building-addresses'

// Cache settings for property data fetchers.
// Worker A syncs underlying Socrata data every 15 minutes, so 5 minutes of staleness
// is always safe. Tags allow targeted revalidation later if we add a webhook from Worker A.
const PROPERTY_CACHE_REVALIDATE_SECONDS = 300

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
  pin?: string | null
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
  violation_code: string | null
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
  reported_cost: number | string | null
  total_fee: number | string | null
  contact_1_type: string | null
  contact_1_name: string | null
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
  [/\bPARKWAY\b/g, 'PKWY'],
  [/\bTERRACE\b/g, 'TER'],
  [/\bCIRCLE\b/g, 'CIR'],
  [/\bHIGHWAY\b/g, 'HWY'],
]

export function normalizeAddress(raw: string): string {
  let s = raw.trim()
  if (!s) return s
  s = (s.split(',')[0] ?? s).trim()
  s = s.replace(/\s+(apt|apartment|unit|#)\s*.*$/i, '').trim()
  s = s.replace(/\./g, '')          // strip periods ("S." → "S", "Blvd." → "Blvd")
  s = s.replace(/\s+/g, ' ').trim()
  s = s.toUpperCase()
  for (const [re, repl] of DIRECTIONAL_ABBREV) s = s.replace(re, repl)
  for (const [re, repl] of STREET_TYPE_ABBREV) s = s.replace(re, repl)
  return s
}

// ---------------------------------------------------------------------------
// Sibling PIN resolution
// ---------------------------------------------------------------------------

/** Data artifacts (not real entities) — never use for Path C or owner portfolio card */
export const JUNK_MAILING_NAMES = new Set([
  'STREET',
  'ALLEY',
  'TAXPAYER OF',
  'TAX PAYER OF',
  'CURRENT OWNER',
  'RAILROAD',
  'UNKNOWN',
  '',
])

export async function fetchSiblingPins(
  pin: string,
  addressNormalized: string
): Promise<{
  siblingPins: string[]
  siblingAddresses: string[]
  addressRange: string | null
  resolvedVia: 'address' | 'commercial' | 'mailing' | 'none' | 'user_range'
}> {
  const supabaseAdmin = supabase
  const noSiblings = {
    siblingPins: [pin],
    siblingAddresses: [addressNormalized],
    addressRange: null,
    resolvedVia: 'none' as const,
  }

  try {
    // PATH D — manual building address range (checked first)
    // Handles large address-range buildings and multi-street-entrance buildings.
    // Two things Path C alone can't do:
    //   (a) Cross-street entrances (La Salle St + Elm St) — Path C only searches one street
    //   (b) Single-PIN parcels — Path C finds nothing if there's only one PIN
    // Path D uses allAddresses for fan-out queries and ALSO does the mailing name lookup
    // to collect all sibling PINs (e.g. all condo unit PINs under "1120 N LASALLE LLC").
    // Uses displayAddresses for the banner to avoid showing all spelling variants.
    const manualBuilding = findManualBuilding(addressNormalized)
    if (manualBuilding) {
      console.log('fetchSiblingPins Path D manual match for:', addressNormalized)

      // Use explicit pins array if provided, otherwise fall back to mailing name lookup
      let allPins: string[] = [pin]
      if (manualBuilding.pins && manualBuilding.pins.length > 0) {
        allPins = manualBuilding.pins
        console.log('fetchSiblingPins Path D using explicit pins array:', allPins.length, 'PINs')
      } else {
        const { data: subject } = await supabaseAdmin
          .from('properties')
          .select('mailing_name')
          .eq('pin', pin)
          .maybeSingle()

        if (subject?.mailing_name && subject.mailing_name.trim() !== '') {
          const { data: mailingMatches } = await supabaseAdmin
            .from('properties')
            .select('pin, address_normalized')
            .eq('mailing_name', subject.mailing_name)
          if (mailingMatches && mailingMatches.length > 0) {
            const buildingAddressSet = new Set(manualBuilding.allAddresses)
            const displayAddrs = manualBuilding.displayAddresses ?? manualBuilding.allAddresses
            const displaySet = new Set(displayAddrs)
            const scopedPins = mailingMatches
              .filter((r: { address_normalized?: string | null }) => {
                const addr = r.address_normalized
                if (!addr) return false
                return (
                  buildingAddressSet.has(addr) ||
                  displaySet.has(addr) ||
                  displayAddrs.some((da) => addr.startsWith(da + ' '))
                )
              })
              .map((r: { pin?: string | null }) => r.pin)
              .filter(Boolean) as string[]
            allPins =
              scopedPins.length > 0 ? [...new Set([pin, ...scopedPins])] : [pin]
            console.log('fetchSiblingPins Path D scoped mailing lookup:', allPins.length, 'PINs')
          }
        }
      }

      const displayAddrs = manualBuilding.displayAddresses ?? manualBuilding.allAddresses
      return {
        siblingPins: allPins,
        siblingAddresses: manualBuilding.allAddresses,
        addressRange: buildAddressRange(displayAddrs),
        resolvedVia: 'mailing',
      }
    }

    // PATH D2 — approved user-submitted building ranges
    const userRange = await findApprovedUserRange(addressNormalized)
    if (userRange) {
      console.log('fetchSiblingPins Path D2 user range match for:', addressNormalized)

      const allAddrs = userRange.allAddresses
      const allPins = await collectPinsForUserRangeAddresses(allAddrs)
      console.log('fetchSiblingPins Path D2 found', allPins.length, 'PINs across range')

      if (allPins.length > 0) {
        return {
          siblingPins: allPins,
          siblingAddresses: userRange.allAddresses,
          addressRange: buildAddressRange(userRange.allAddresses),
          resolvedVia: 'user_range',
        }
      }
    }

    // PATH A — multiple PINs share exact same address (condo tower)
    // Also tries prefix match to catch unit-suffixed condos (943 W 95TH ST → 943 W 95TH ST G, 1W, etc.)
    console.log('fetchSiblingPins entered, pin:', pin, 'address:', addressNormalized)
    let { data: sameAddress } = await supabaseAdmin
      .from('properties')
      .select('pin, address_normalized')
      .eq('address_normalized', addressNormalized)

    if (!sameAddress || sameAddress.length <= 1) {
      const prefixResult = await supabaseAdmin
        .from('properties')
        .select('pin, address_normalized')
        .like('address_normalized', `${addressNormalized} %`)
      if (prefixResult.data && prefixResult.data.length > 0) {
        const combined = [...(sameAddress ?? []), ...prefixResult.data]
        const uniquePins = new Map<string, any>()
        for (const r of combined) {
          if (r.pin) uniquePins.set(r.pin, r)
        }
        sameAddress = Array.from(uniquePins.values())
      }
    }

    if (sameAddress && sameAddress.length > 1) {
      const pins = sameAddress.map((r: any) => r.pin).filter(Boolean) as string[]
      const addresses = [...new Set(sameAddress.map((r: any) => r.address_normalized).filter(Boolean))] as string[]

      // Detect unit-suffix condos: all addresses start with the searched base address
      const allAreUnitSuffixed = addresses.every(a => a.startsWith(addressNormalized + ' ') || a === addressNormalized)

      if (allAreUnitSuffixed) {
        // Include base address so complaints/violations/permits get fetched
        const allAddresses = [...new Set([addressNormalized, ...addresses])]
        return {
          siblingPins: pins,
          siblingAddresses: allAddresses,
          addressRange: addressNormalized,
          resolvedVia: 'address',
        }
      }

      const range = buildAddressRange(addresses) ?? (pins.length > 1 ? `${addresses[0]} (${pins.length} parcels)` : null)
      return {
        siblingPins: pins,
        siblingAddresses: addresses,
        addressRange: range,
        resolvedVia: 'address',
      }
    }

    // PATH B removed — was a leading-wildcard ilike seq scan on property_chars_commercial
    // whose result was never consumed. Path C is authoritative.

    // PATH C — mailing name + same street (authoritative)
    const { data: subject } = await supabaseAdmin
      .from('properties')
      .select('mailing_name, address_normalized')
      .eq('pin', pin)
      .maybeSingle()
    console.log('Path C subject:', JSON.stringify(subject), 'pin queried:', pin)

    if (subject?.mailing_name && subject.mailing_name.trim() !== '') {
      const mailingKey = subject.mailing_name.trim().toUpperCase()
      if (JUNK_MAILING_NAMES.has(mailingKey)) {
        console.log('Path C skipped — junk mailing name:', mailingKey)
        return noSiblings
      }

      const { count: mailingPinCount } = await supabaseAdmin
        .from('properties')
        .select('pin', { count: 'exact', head: true })
        .eq('mailing_name', subject.mailing_name)
      if (mailingPinCount != null && mailingPinCount > 500) {
        console.log('Path C skipped — mega-entity mailing count:', mailingPinCount)
        return noSiblings
      }

      const parts = addressNormalized.split(' ')
      // Detect if second word is a direction (N/S/E/W) or part of the street name
      const hasDirection = parts.length >= 3 && /^[NSEW]$/.test(parts[1])
      const streetWords = hasDirection
        ? parts.slice(2).join(' ')
        : parts.slice(1).join(' ')

      // Safety: don't run if street extracted is too short (just a type suffix like "AVE" or "ST")
      if (!streetWords || streetWords.length <= 3) {
        console.log('Path C skipped — street extraction too short:', streetWords)
        return noSiblings
      }

      // Parse the subject street number for the ±10 range cap.
      // Path C used to group ANY same-mailing-name property on the same street,
      // which incorrectly conflated cross-block portfolios (e.g. 2970 N Sheridan
      // and 3260 N Sheridan, both owned by FORMAN REALTY CORP, treated as one
      // building). Real conjoined-parcel buildings are within ±10 street numbers
      // of each other (corner buildings, address-range buildings). Anything
      // beyond that is a portfolio relationship, not a same-building relationship.
      const subjectStreetNum = parseInt(parts[0], 10)
      if (Number.isNaN(subjectStreetNum)) {
        console.log('Path C skipped — could not parse subject street number:', parts[0])
        return noSiblings
      }

      const { data: siblings } = await supabaseAdmin
        .from('properties')
        .select('pin, address_normalized')
        .eq('mailing_name', subject.mailing_name)
        .ilike('address_normalized', `%${streetWords}%`)

      if (siblings && siblings.length > 0) {
        // Filter siblings to only those within ±10 street numbers of the subject.
        // This is the new cap that prevents cross-block portfolio grouping.
        const STREET_NUMBER_RANGE = 10
        const filteredSiblings = siblings.filter((r: { address_normalized?: string | null }) => {
          const siblingAddr = r.address_normalized as string | null
          if (!siblingAddr) return false
          const siblingNum = parseInt(siblingAddr.split(' ')[0], 10)
          if (Number.isNaN(siblingNum)) return false
          return Math.abs(siblingNum - subjectStreetNum) <= STREET_NUMBER_RANGE
        })

        console.log(
          'Path C siblings result:',
          JSON.stringify(filteredSiblings),
          'streetWords:',
          streetWords,
          'filtered_from:',
          siblings.length
        )

        if (filteredSiblings.length > 0) {
          const mailingPins = filteredSiblings.map((r: { pin?: string }) => r.pin).filter(Boolean) as string[]
          const mailingAddresses = [
            ...new Set(
              filteredSiblings.map((r: { address_normalized?: string | null }) => r.address_normalized).filter(Boolean)
            ),
          ] as string[]
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
    }

    return noSiblings
  } catch (e) {
    console.log('fetchSiblingPins error:', e instanceof Error ? e.message : String(e))
    return noSiblings
  }
}

/**
 * Enumerate addresses between low and high, respecting even/odd parity (one side of street).
 * "342 W X" to "344 W X" → 342, 344. "609 W NORTH AVE" to "645 W NORTH AVE" → 609, 611, …, 645.
 */
function enumerateAddressRange(low: string, high: string): string[] {
  const lowParts = low.trim().split(/\s+/)
  const highParts = high.trim().split(/\s+/)
  const lowNum = parseInt(lowParts[0] ?? '', 10)
  const highNum = parseInt(highParts[0] ?? '', 10)
  const street = lowParts.slice(1).join(' ')
  if (Number.isNaN(lowNum) || Number.isNaN(highNum) || !street) return []
  const start = Math.min(lowNum, highNum)
  const end = Math.max(lowNum, highNum)
  const parity = start % 2
  const addresses: string[] = []
  for (let num = start; num <= end; num++) {
    if (num % 2 === parity) addresses.push(normalizeAddress(`${num} ${street}`))
  }
  return addresses
}

type UserBuildingRangeRow = {
  street1_low: string | null
  street1_high: string | null
  street2_low: string | null
  street2_high: string | null
  street3_low: string | null
  street3_high: string | null
  street4_low: string | null
  street4_high: string | null
}

export async function findApprovedUserRange(
  normalizedAddress: string
): Promise<{
  allAddresses: string[]
  displayAddresses: string[]
  canonicalAddress: string
} | null> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.from('user_building_ranges').select('*').eq('status', 'approved')
    if (error || !data?.length) return null

    for (const range of data as UserBuildingRangeRow[]) {
      const allAddresses: string[] = []
      for (let i = 1; i <= 4; i++) {
        const low = range[`street${i}_low` as keyof UserBuildingRangeRow] as string | null | undefined
        const high = range[`street${i}_high` as keyof UserBuildingRangeRow] as string | null | undefined
        if (!low || !high) continue
        allAddresses.push(...enumerateAddressRange(low, high))
      }
      if (allAddresses.length === 0) continue

      const uniqueAll = [...new Set(allAddresses)]
      if (uniqueAll.includes(normalizedAddress)) {
        return {
          allAddresses: uniqueAll,
          displayAddresses: uniqueAll,
          canonicalAddress: uniqueAll[0]!,
        }
      }
    }
    return null
  } catch (e) {
    console.log('findApprovedUserRange error:', e instanceof Error ? e.message : String(e))
    return null
  }
}

export function buildAddressRange(addresses: string[]): string | null {
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

/** PINs on `properties` matching any address in an approved user building range (exact + unit suffix). */
export async function collectPinsForUserRangeAddresses(allAddrs: string[]): Promise<string[]> {
  const supabaseAdmin = supabase
  let allPins: string[] = []
  for (let i = 0; i < allAddrs.length; i += 50) {
    const batch = allAddrs.slice(i, i + 50)
    const { data } = await supabaseAdmin.from('properties').select('pin').in('address_normalized', batch)
    if (data) allPins.push(...data.map((r: { pin?: string | null }) => r.pin).filter(Boolean) as string[])
  }
  for (let i = 0; i < allAddrs.length; i += 10) {
    const batch = allAddrs.slice(i, i + 10)
    const orConditions = batch
      .map((a) => {
        const pattern = `${a} %`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        return `address_normalized.like."${pattern}"`
      })
      .join(',')
    const { data } = await supabaseAdmin.from('properties').select('pin').or(orConditions)
    if (data) allPins.push(...data.map((r: { pin?: string | null }) => r.pin).filter(Boolean) as string[])
  }
  return [...new Set(allPins)]
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

    // Tier 2 — try all known street type suffixes as exact matches via .in()
    // Handles slug/data street-type mismatches e.g. slug says "Drive" but data has "Street"
    // Uses .in() (equality) instead of LIKE — btree index works for equality without text_pattern_ops
    if (!data && !error) {
      const SUFFIXES = ['ST', 'AVE', 'BLVD', 'DR', 'CT', 'PL', 'LN', 'RD', 'WAY', 'PKWY', 'TER', 'CIR']
      const withoutSuffix = normalizedAddress.replace(/\s+(ST|AVE|BLVD|DR|CT|PL|LN|RD|WAY|PKWY|TER|CIR)$/i, '')
      if (withoutSuffix !== normalizedAddress) {
        // Only run if there was actually a suffix to strip
        const tier2Candidates = SUFFIXES.map(s => `${withoutSuffix} ${s}`)
        const fallback = await supabase
          .from('properties')
          .select(SELECT_COLS)
          .in('address', tier2Candidates)
          .order('pin', { ascending: true })
          .limit(1)
          .maybeSingle()
        data = fallback.data
        error = fallback.error
      }
    }

    if (error) throw new Error(error.message)

      if (data) {
        console.log('fetchProperty result:', JSON.stringify(data))
        return { property: data as PropertyRow, nearestParcel: null, error: null }
      }
  
      // Tier 2.5 — "ST" → "SAINT" expansion
      // Cook County stores some saint-named streets fully expanded ("4221 N SAINT LOUIS AVE")
      // while users routinely type the abbreviation ("4221 N St Louis Ave"). Without this,
      // the request silently dies through every later tier even though the PIN exists.
      // Detects "ST" mid-address followed by a non-street-type word (so we don't grab
      // legitimate street-type "ST" at the end like "MAIN ST").
      {
        const STREET_TYPES = new Set(['ST', 'AVE', 'BLVD', 'DR', 'CT', 'PL', 'LN', 'RD', 'WAY', 'PKWY', 'TER', 'CIR', 'HWY'])
        const tokens = normalizedAddress.split(' ')
        const stIdx = tokens.findIndex((t, i) => t === 'ST' && i > 0 && i < tokens.length - 1 && !STREET_TYPES.has(tokens[i + 1]))
        if (stIdx > 0) {
          const expanded = [...tokens.slice(0, stIdx), 'SAINT', ...tokens.slice(stIdx + 1)].join(' ')
          const saintFallback = await supabase
            .from('properties')
            .select(SELECT_COLS)
            .eq('address', expanded)
            .order('pin', { ascending: true })
            .limit(1)
            .maybeSingle()
            if (saintFallback.data) {
              console.log('fetchProperty Tier 2.5 SAINT match:', expanded)
              return { property: saintFallback.data as PropertyRow, nearestParcel: null, error: null }
            }
            // Also try prefix match for condo buildings stored with unit suffixes
            // (e.g. "4652 N SAINT LOUIS AVE 1E" when search was "4652 N ST LOUIS AVE")
            const saintPrefix = await supabase
              .from('properties')
              .select(SELECT_COLS)
              .like('address', `${expanded} %`)
              .order('pin', { ascending: true })
              .limit(1)
              .maybeSingle()
            if (saintPrefix.data) {
              console.log('fetchProperty Tier 2.5 SAINT prefix match:', expanded)
              return { property: saintPrefix.data as PropertyRow, nearestParcel: null, error: null }
            }
          }
        }
  
      // Tier 2.6 — street alias substitution (legacy ↔ modern street names)
    // Cook County Assessor stores MLK Drive as "S Park Ave" (pre-1968 rename),
    // while 311/violations/permits use "Dr Martin Luther King Jr Dr" (modern form).
    // Without these aliases, the request silently misses through every later tier
    // even though the PIN exists.
    {
      const STREET_ALIASES: Array<[RegExp, string[]]> = [
        [/ S KING DR$/, [' S S PARK AVE', ' S DR MARTIN LUTHER KING JR DR']],
        [/ S S PARK AVE$/, [' S KING DR']],
        [/ S DR MARTIN LUTHER KING JR DR$/, [' S KING DR', ' S S PARK AVE']],
      ]
      for (const [pattern, replacements] of STREET_ALIASES) {
        if (pattern.test(normalizedAddress)) {
          for (const replacement of replacements) {
            const aliased = normalizedAddress.replace(pattern, replacement)
            const aliasResult = await supabase
              .from('properties')
              .select(SELECT_COLS)
              .eq('address_normalized', aliased)
              .order('pin', { ascending: true })
              .limit(1)
              .maybeSingle()
            if (aliasResult.data) {
              console.log('fetchProperty Tier 2.6 alias match:', aliased)
              return { property: aliasResult.data as PropertyRow, nearestParcel: null, error: null }
            }
          }
        }
      }
    }

    // Tier 2.4 — manual building range lookup (runs before prefix match)
    // Manual entries are explicit user-curated mappings and must win over
    // fuzzy prefix matches that could pull condo unit records from unrelated buildings.
    // Returns full property data (not just nearestParcel) so the detail panel renders completely.
    // Add entries to lib/manual-building-addresses.ts for new STR customers and large buildings.
    const manualEntry = findManualBuilding(normalizedAddress)
    if (manualEntry) {
      console.log('fetchProperty Tier 2.4 manual match:', manualEntry.canonicalAddress)
      const manualResult = await supabase
        .from('properties')
        .select(SELECT_COLS)
        .eq('address', manualEntry.canonicalAddress)
        .order('pin', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (manualResult.data) {
        return { property: manualResult.data as PropertyRow, nearestParcel: null, error: null }
      }
    }

    // Tier 2.5 — prefix match (condos with unit suffixes)
    // Handles: search "943 W 95TH ST" → matches "943 W 95TH ST G", "943 W 95TH ST 1W", etc.
    // Runs AFTER manual building lookup so explicit mappings win over fuzzy prefix matches.
    if (!data && !error) {
      const prefixPattern = `${normalizedAddress} %`
      const prefixFallback = await supabase
        .from('properties')
        .select(SELECT_COLS)
        .like('address', prefixPattern)
        .order('pin', { ascending: true })
        .limit(1)
        .maybeSingle()
      data = prefixFallback.data
      error = prefixFallback.error
    }

    if (error) throw new Error(error.message)

    if (data) {
      console.log('fetchProperty result (prefix match):', JSON.stringify(data))
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

      // Generate street suffix variants to handle compound name differences between datasets:
      //   "LASALLE DR"    → also try "LA SALLE DR"    (Assessor: two words)
      //   "DESPLAINES ST" → also try "DES PLAINES ST" (Assessor: two words)
      // If the street name (before type like DR/ST/AVE) is a single unspaced word ≥5 chars,
      // also try splitting after positions 2 and 3.
      const suffixVariants: string[] = [streetSuffix]
      const suffixWords = streetSuffix.split(' ')
      const streetType = suffixWords[suffixWords.length - 1]
      const streetName = suffixWords.slice(0, -1).join(' ')
      if (!streetName.includes(' ') && streetName.length >= 5) {
        suffixVariants.push(`${streetName.slice(0, 2)} ${streetName.slice(2)} ${streetType}`)
        if (streetName.length >= 6) {
          suffixVariants.push(`${streetName.slice(0, 3)} ${streetName.slice(3)} ${streetType}`)
        }
      }

      const candidates: string[] = []
      for (const offset of stepOffsets) {
        const num = streetNum + offset
        if (num <= 0) continue
        for (const dir of directions) {
          for (const suffix of suffixVariants) {
            candidates.push(`${num} ${dir} ${suffix}`)
          }
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

async function _fetchParcelUniverseUncached(pin: string): Promise<{
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

export const fetchParcelUniverse = unstable_cache(
  _fetchParcelUniverseUncached,
  ['fetch-parcel-universe'],
  { revalidate: PROPERTY_CACHE_REVALIDATE_SECONDS, tags: ['parcel-universe'] }
)

/** Latest `parcel_universe.class` for a PIN (tax_year desc). Used when assessed_values class is 299 for all units. */
export async function fetchParcelUniverseClass(pin: string): Promise<string | null> {
  if (!pin || !normalizePinSilent(pin)) return null
  const pinQuery = normalizePinSilent(pin)
  try {
    const { data, error } = await supabase
      .from('parcel_universe')
      .select('class')
      .eq('pin', pinQuery)
      .order('tax_year', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.class == null) return null
    return String(data.class)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

async function _fetchComplaintsUncached(normalizedAddress: string): Promise<{
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

export const fetchComplaints = unstable_cache(
  _fetchComplaintsUncached,
  ['fetch-complaints-by-address'],
  { revalidate: PROPERTY_CACHE_REVALIDATE_SECONDS, tags: ['complaints'] }
)

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

async function _fetchViolationsUncached(addressNormalized: string): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('address_normalized, violation_code, violation_description, violation_status, violation_date, violation_last_modified_date, inspection_status, inspection_category, department_bureau, violation_inspector_comments, violation_ordinance, inspection_number, is_stop_work_order')
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

export const fetchViolations = unstable_cache(
  _fetchViolationsUncached,
  ['fetch-violations-by-address'],
  { revalidate: PROPERTY_CACHE_REVALIDATE_SECONDS, tags: ['violations'] }
)

export async function fetchViolationsByPin(pin: string): Promise<{
  violations: ViolationRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('violations')
      .select('address_normalized, violation_code, violation_description, violation_status, violation_date, violation_last_modified_date, inspection_status, inspection_category, department_bureau, violation_inspector_comments, violation_ordinance, inspection_number, is_stop_work_order')
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
      .select('address_normalized, violation_code, violation_description, violation_status, violation_date, violation_last_modified_date, inspection_status, inspection_category, department_bureau, violation_inspector_comments, violation_ordinance, inspection_number, is_stop_work_order')
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

async function _fetchPermitsUncached(normalizedAddress: string): Promise<{
  permits: PermitRow[]
  error: string | null
}> {
  try {
    // .like (case-sensitive) instead of .ilike — address_normalized is always uppercase,
    // and ilike cannot use a text_pattern_ops btree index; .like with trailing wildcard can.
    const pattern = `${normalizedAddress}%`
    const { data, error } = await supabase
      .from('permits')
      .select('address_normalized, permit_type, permit_status, work_description, issue_date, permit_number, reported_cost, total_fee, contact_1_type, contact_1_name, is_roof_permit')
      .like('address_normalized', pattern)
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

export const fetchPermits = unstable_cache(
  _fetchPermitsUncached,
  ['fetch-permits-by-address'],
  { revalidate: PROPERTY_CACHE_REVALIDATE_SECONDS, tags: ['permits'] }
)

export async function fetchPermitsByPin(pin: string): Promise<{
  permits: PermitRow[]
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('permits')
      .select('address_normalized, permit_type, permit_status, work_description, issue_date, permit_number, reported_cost, total_fee, contact_1_type, contact_1_name, is_roof_permit')
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
      .select('address_normalized, permit_type, permit_status, work_description, issue_date, permit_number, reported_cost, total_fee, contact_1_type, contact_1_name, is_roof_permit')
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
  'pin,year_built,building_sqft,unit_sqft,num_bedrooms,building_pins,building_non_units,bldg_is_mixed_use,is_parking_space,is_common_area,land_sqft,tax_year'

async function _fetchPropertyCharsResidentialUncached(pin: string): Promise<{
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

export const fetchPropertyCharsResidential = unstable_cache(
  _fetchPropertyCharsResidentialUncached,
  ['fetch-property-chars-residential'],
  { revalidate: PROPERTY_CACHE_REVALIDATE_SECONDS, tags: ['property-chars'] }
)

async function _fetchPropertyCharsCondoUncached(pin: string): Promise<{
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

export const fetchPropertyCharsCondo = unstable_cache(
  _fetchPropertyCharsCondoUncached,
  ['fetch-property-chars-condo'],
  { revalidate: PROPERTY_CACHE_REVALIDATE_SECONDS, tags: ['property-chars'] }
)

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

async function _fetchAssessedValueUncached(pin: string | null | undefined): Promise<{
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

export const fetchAssessedValue = unstable_cache(
  _fetchAssessedValueUncached,
  ['fetch-assessed-value'],
  { revalidate: PROPERTY_CACHE_REVALIDATE_SECONDS, tags: ['assessed-values'] }
)

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

    // First try: PIN is the keypin itself
    let { data, error } = await supabaseAdmin
      .from('property_chars_commercial')
      .select('keypin, pins, tax_year, sheet, class, property_type_use, year_built, building_sqft, land_sqft, noi, caprate, final_market_value, income_market_value, adj_rent_sf, investment_rating')
      .eq('keypin', pin)
      .order('tax_year', { ascending: false })
      .order('sheet', { ascending: true })

    if (error) throw new Error(error.message)

    // Second try: PIN appears inside another record's pins column
    // The pins column stores dashed PINs like "17-04-411-006-0000"
    if (!data || data.length === 0) {
      const dashedPin = pin.replace(
        /^(\d{2})(\d{2})(\d{3})(\d{3})(\d{4})$/,
        '$1-$2-$3-$4-$5'
      )
      const { data: data2, error: error2 } = await supabaseAdmin
        .from('property_chars_commercial')
        .select('keypin, pins, tax_year, sheet, class, property_type_use, year_built, building_sqft, land_sqft, noi, caprate, final_market_value, income_market_value, adj_rent_sf, investment_rating')
        .ilike('pins', `%${dashedPin}%`)
        .order('tax_year', { ascending: false })
        .order('sheet', { ascending: true })

      if (error2) throw new Error(error2.message)
      data = data2
    }

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