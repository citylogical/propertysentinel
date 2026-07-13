// lib/rentroll/resolve.ts
//
// Per-address resolution for the rent-roll import: one parsed address →
// PINs + building snapshot + a match grade for the review screen. This is
// the recipe from app/api/admin/import-rentroll/route.ts (the code path that
// imported the GC Realty portfolio), extracted so the chunked
// /api/dashboard/import/process route and test harnesses share it.
//
// Match grades drive the review UI:
//   verified — fetchProperty matched a parcel (green check)
//   range    — verified AND the building fans out across an address range /
//              sibling addresses (green check + range badge)
//   nearest  — no direct match, but a parcel within 5 street numbers was
//              adopted (amber — user confirms or edits)
//   no_match — nothing found; staged "blind" if the user keeps it (amber)
//
// Every metadata step after the core fetchProperty call is best-effort:
// a missing snapshot or chars row degrades the row, never fails it.

import {
  normalizeAddress,
  fetchProperty,
  fetchSiblingPins,
  fetchPropertyChars,
  fetchParcelUniverse,
  buildAddressRange,
  collectPinsForUserRangeAddresses,
  stripUnitSuffix,
} from '@/lib/supabase-search'
import { getPortfolioSaveBuildingSnapshot } from '@/lib/portfolio-save-building-snapshot'
import { ensureHansenRecord } from '@/lib/hansen/ensure'

export type ImportMatchGrade = 'verified' | 'range' | 'nearest' | 'no_match'

/** One resolved address — the staged_properties snapshot payload plus grading. */
export type ImportResolution = {
  raw_address: string
  match: ImportMatchGrade
  canonical_address: string
  slug: string
  pins: string[]
  address_range: string | null
  sibling_addresses: string[]
  zip: string | null
  sqft: number | null
  year_built: string | null
  implied_value: number | null
  community_area: string | null
  property_class: string | null
  num_units_from_chars: number | null
  /** For no_match rows: the closest parcel we saw (too far to adopt). */
  nearest_suggestion: string | null
  nearest_distance: number | null
  error: string | null
}

// "3515-17 S Lituanica" → baseAddress "3515 S Lituanica", display "3515–3517 S LITUANICA AVE".
// Handles abbreviated high ends and guards against absurd ranges.
// (Same logic as app/api/admin/import-rentroll/route.ts.)
export function parseAddressRange(raw: string): {
  baseAddress: string
  rangeDisplay: string | null
} {
  const m = raw.match(/^\s*(\d+)\s*[–—−\-]\s*(\d+)\s+(.+)$/)
  if (!m) return { baseAddress: raw, rangeDisplay: null }
  const lowStr = m[1]
  let highStr = m[2]
  if (highStr.length < lowStr.length) {
    highStr = lowStr.slice(0, lowStr.length - highStr.length) + highStr
  }
  const low = parseInt(lowStr, 10)
  const high = parseInt(highStr, 10)
  const rest = m[3].trim()
  if (Math.abs(high - low) > 30) return { baseAddress: raw, rangeDisplay: null }
  return {
    baseAddress: `${low} ${rest}`,
    rangeDisplay: `${low}–${high} ${normalizeAddress(rest)}`,
  }
}

// "1632 N WOOD ST" + "60622" → "1632-North-Wood-Street-Chicago-60622".
// (Same logic as app/api/admin/import-rentroll/route.ts.)
export function generateSlug(canonicalAddress: string, zip: string | null): string {
  const REVERSE_DIR: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }
  const REVERSE_TYPE: Record<string, string> = {
    ST: 'Street', AVE: 'Avenue', BLVD: 'Boulevard', DR: 'Drive',
    CT: 'Court', PL: 'Place', LN: 'Lane', RD: 'Road',
    PKWY: 'Parkway', TER: 'Terrace', CIR: 'Circle', HWY: 'Highway',
  }
  const tokens = canonicalAddress.split(' ').map((t) => {
    const up = t.toUpperCase()
    if (REVERSE_DIR[up]) return REVERSE_DIR[up]
    if (REVERSE_TYPE[up]) return REVERSE_TYPE[up]
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  })
  return zip ? `${tokens.join('-')}-Chicago-${zip}` : `${tokens.join('-')}-Chicago`
}

/** Distance (in street numbers) within which a nearest-parcel is adopted. */
const NEAREST_ADOPT_DISTANCE = 5

export async function resolveImportAddress(rawAddress: string): Promise<ImportResolution> {
  const { baseAddress, rangeDisplay } = parseAddressRange(rawAddress)
  const normalized = normalizeAddress(baseAddress)

  const blind = (extra?: Partial<ImportResolution>): ImportResolution => ({
    raw_address: rawAddress,
    match: 'no_match',
    canonical_address: normalized,
    slug: generateSlug(normalized, null),
    pins: [],
    address_range: rangeDisplay,
    sibling_addresses: [normalized],
    zip: null,
    sqft: null,
    year_built: null,
    implied_value: null,
    community_area: null,
    property_class: null,
    num_units_from_chars: null,
    nearest_suggestion: null,
    nearest_distance: null,
    error: null,
    ...extra,
  })

  if (!normalized) return blind({ error: 'Empty address after normalization' })

  try {
    const { property, nearestParcel, error } = await fetchProperty(normalized)
    if (error) return blind({ error })

    let resolved = property
    let grade: ImportMatchGrade = 'verified'

    if (!resolved && nearestParcel && nearestParcel._nearestDist <= NEAREST_ADOPT_DISTANCE) {
      resolved = nearestParcel
      grade = 'nearest'
    }

    if (!resolved) {
      // No parcel match — Hansen may still know the building (the Assessor
      // often stores only the low address of a range). Archive-first, live
      // handshake only on a retry-eligible miss. A multi-address hit whose
      // range collects real PINs rescues the row to a green range match.
      const base = stripUnitSuffix(normalized) ?? normalized
      const hansen = await ensureHansenRecord(base)
      if (hansen && hansen.allAddresses.length > 1) {
        const hansenPins = await collectPinsForUserRangeAddresses(hansen.allAddresses)
        if (hansenPins.length > 0) {
          let yearBuilt: string | null = null
          let impliedValue: number | null = null
          let propertyClass: string | null = null
          let communityArea: string | null = null
          try {
            const { parcel } = await fetchParcelUniverse(hansenPins[0])
            communityArea = parcel?.community_area_name?.trim() ?? null
            const snapshot = await getPortfolioSaveBuildingSnapshot({
              normalizedPin: hansenPins[0],
              siblingPins: hansenPins,
              useMultiPinImplied: hansenPins.length > 1,
              propertyClassFallback: null,
              communityArea,
            })
            yearBuilt = snapshot.yearBuilt
            impliedValue = snapshot.impliedValue
            propertyClass = snapshot.propertyClass
            communityArea = snapshot.communityArea
          } catch (e) {
            console.error('[resolveImportAddress] hansen-rescue snapshot failed:', e)
          }
          return {
            raw_address: rawAddress,
            match: 'range',
            canonical_address: normalized,
            slug: generateSlug(normalized, null),
            pins: hansenPins,
            address_range: buildAddressRange(hansen.allAddresses) ?? rangeDisplay,
            sibling_addresses: hansen.allAddresses,
            zip: null,
            sqft: null,
            year_built: yearBuilt,
            implied_value: impliedValue,
            community_area: communityArea,
            property_class: propertyClass,
            num_units_from_chars: null,
            nearest_suggestion: null,
            nearest_distance: null,
            error: null,
          }
        }
      }
      return blind(
        nearestParcel
          ? {
              nearest_suggestion: nearestParcel.address_normalized ?? null,
              nearest_distance: nearestParcel._nearestDist,
            }
          : undefined
      )
    }

    const canonical = resolved.address_normalized ?? normalized

    // Building range — HANSEN FIRST. The city's own building record is the
    // definitive range source (archive first, live handshake only on a
    // retry-eligible miss; negative cache + global rate caps respected).
    // Only when Hansen has no multi-address range for the building do we
    // fall back to the properties-table cascade in fetchSiblingPins
    // (manual entries → approved user ranges → condo fan-out → mailing-name
    // grouping). PINs across a Hansen range are collected exact + unit-
    // suffix-prefix, so condo unit PINs still come along.
    let pins = resolved.pin ? [resolved.pin] : []
    let siblingAddresses = [canonical]
    let addressRange: string | null = rangeDisplay
    let rangeSource: 'hansen' | 'fanout' | 'none' = 'none'

    try {
      const base = stripUnitSuffix(canonical) ?? canonical
      const hansen = await ensureHansenRecord(base)
      if (hansen && hansen.allAddresses.length > 1) {
        const hansenPins = await collectPinsForUserRangeAddresses(hansen.allAddresses)
        if (hansenPins.length > 0) {
          pins = [...new Set([...pins, ...hansenPins])]
          siblingAddresses = hansen.allAddresses
          addressRange = buildAddressRange(hansen.allAddresses) ?? addressRange
          rangeSource = 'hansen'
        }
      }
    } catch (e) {
      console.error('[resolveImportAddress] hansen ensure failed:', e)
    }

    if (rangeSource !== 'hansen') {
      try {
        if (resolved.pin) {
          const siblings = await fetchSiblingPins(resolved.pin, canonical)
          pins = siblings.siblingPins.length > 0 ? siblings.siblingPins : pins
          siblingAddresses = siblings.siblingAddresses.length > 0 ? siblings.siblingAddresses : siblingAddresses
          // Prefer the sibling-derived range over the rent roll's own hint.
          addressRange = siblings.addressRange ?? rangeDisplay
          if (siblings.resolvedVia !== 'none') rangeSource = 'fanout'
        }
      } catch (e) {
        console.error('[resolveImportAddress] sibling fan-out failed:', e)
      }
    }

    if (grade === 'verified' && (addressRange !== null || siblingAddresses.length > 1)) {
      grade = 'range'
    }

    // Building composition snapshot — same helper the address page save uses.
    let communityArea: string | null = null
    try {
      if (resolved.pin) {
        const { parcel } = await fetchParcelUniverse(resolved.pin)
        communityArea = parcel?.community_area_name?.trim() ?? null
      }
    } catch (e) {
      console.error('[resolveImportAddress] parcel_universe lookup failed:', e)
    }

    let yearBuilt: string | null = null
    let impliedValue: number | null = null
    let propertyClass: string | null = resolved.property_class ?? null
    try {
      const snapshot = await getPortfolioSaveBuildingSnapshot({
        normalizedPin: resolved.pin ?? null,
        siblingPins: pins,
        useMultiPinImplied: pins.length > 1,
        propertyClassFallback: resolved.property_class ?? null,
        communityArea,
      })
      yearBuilt = snapshot.yearBuilt
      impliedValue = snapshot.impliedValue
      propertyClass = snapshot.propertyClass
      communityArea = snapshot.communityArea
    } catch (e) {
      console.error('[resolveImportAddress] building snapshot failed:', e)
    }

    let sqft: number | null = null
    let numUnits: number | null = null
    try {
      if (resolved.pin) {
        const { chars } = await fetchPropertyChars(resolved.pin)
        if (chars) {
          sqft = (chars.building_sqft as number | null) ?? null
          numUnits = (chars.num_apartments as number | null) ?? null
        }
      }
    } catch (e) {
      console.error('[resolveImportAddress] property chars lookup failed:', e)
    }

    return {
      raw_address: rawAddress,
      match: grade,
      canonical_address: canonical,
      slug: generateSlug(canonical, resolved.zip ?? null),
      pins,
      address_range: addressRange,
      sibling_addresses: siblingAddresses,
      zip: resolved.zip ?? null,
      sqft,
      year_built: yearBuilt,
      implied_value: impliedValue,
      community_area: communityArea,
      property_class: propertyClass,
      num_units_from_chars: numUnits,
      nearest_suggestion: grade === 'nearest' ? canonical : null,
      nearest_distance: grade === 'nearest' ? (nearestParcel?._nearestDist ?? null) : null,
      error: null,
    }
  } catch (e) {
    return blind({ error: e instanceof Error ? e.message : String(e) })
  }
}
