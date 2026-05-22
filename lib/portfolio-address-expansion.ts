/** Shared helpers for portfolio save: expand numeric ranges and list all queryable addresses. */

import { addressToSlug } from './address-slug'
import { formatAddressForDisplay } from './formatAddress'

export function expandAddressRange(segment: string): string[] {
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
  addressRange: string | null,
  additionalStreets: string[] | null
): string[] {
  const addrs = new Set<string>()
  addrs.add(canonicalAddress.toUpperCase().replace(/\s+/g, ' ').trim())
  if (addressRange) {
    for (const part of addressRange.split('&')) {
      for (const a of expandAddressRange(part)) addrs.add(a)
    }
  }
  if (additionalStreets) {
    for (const s of additionalStreets) {
      if (s?.trim()) {
        for (const part of s.split('&')) {
          for (const a of expandAddressRange(part)) addrs.add(a)
        }
      }
    }
  }
  addrs.delete('')
  return Array.from(addrs)
}

/** Segments of `addressRange` (split on ` & `) whose expanded addresses do not include `canonicalNormalized`. */
export function additionalStreetSegmentsForPortfolio(
  addressRange: string | null,
  canonicalNormalized: string
): string[] {
  if (!addressRange?.trim()) return []
  const canonical = canonicalNormalized.toUpperCase().replace(/\s+/g, ' ').trim()
  const segments = addressRange
    .split(' & ')
    .map((p) => p.trim())
    .filter(Boolean)
  return segments.filter((seg) => {
    const expanded = expandAddressRange(seg)
    return !expanded.includes(canonical)
  })
}

/**
 * Build the slug to use when navigating to a portfolio property's address
 * page from a dashboard context (Portfolio detail panel, Activity Feed,
 * daily digest email).
 *
 * Priority order:
 *   1. display_name — authoritative source for the BUILDING's address.
 *      Always cleaned up at save-time (no unit suffix). For
 *      "2724 W Warren Blvd 1W" the canonical is the unit, but the building
 *      display_name is "2724 W Warren Blvd" — that's what we want for the
 *      address page lookup.
 *   2. address_range first-expanded segment when canonical is covered by
 *      the range — covers range-anchored buildings where display_name is
 *      missing.
 *   3. Canonical address (last resort).
 *
 * The zip is extracted from storedSlug when display_name is used, since
 * display_name doesn't carry a zip. Falls back to no zip if storedSlug
 * isn't parseable.
 *
 * Past failure modes this guards against:
 *   - Unit-suffix canonical addresses (2724 W Warren Blvd 1W, 1505 N
 *     Maplewood Ave 1, 331 S Peoria St 101) — stored slug encodes the
 *     unit, links route to a unit page that has 0 complaints since
 *     activity is filed at the base address.
 *   - Cross-street range/canonical mismatches (600 N Lake Shore Dr
 *     canonical + 460-460 E Ohio St range) — deriving from range would
 *     route to wrong street.
 */
export function getPortfolioBuildingSlug(
  canonicalAddress: string,
  addressRange: string | null,
  storedSlug: string | null,
  displayName: string | null = null
): string {
  const canonicalNormalized = canonicalAddress.toUpperCase().replace(/\s+/g, ' ').trim()

  // 1. Prefer display_name when present — authoritative source for the
  //    building's address. Combine with zip extracted from storedSlug.
  if (displayName && displayName.trim() !== '') {
    const zipMatch = storedSlug?.match(/-(\d{5})$/)
    const zip = zipMatch?.[1] ?? null
    const baseSlug = addressToSlug(formatAddressForDisplay(displayName.trim()))
    // addressToSlug produces "2724-W-Warren-Blvd" from "2724 W Warren Blvd".
    // If storedSlug had a zip, append it as "-Chicago-60612" to match the
    // canonical slug format expected by the address page.
    if (zip) {
      return baseSlug.includes(`-${zip}`) ? baseSlug : `${baseSlug}-Chicago-${zip}`
    }
    return baseSlug
  }

  // 2. Range-anchored: when canonical is covered by an address_range
  //    segment, use the first expanded address. Validates that range
  //    and canonical are on the same street (prevents the Lake Shore Dr
  //    → Ohio St misroute).
  if (addressRange?.trim()) {
    const segments = addressRange.split('&').map((s) => s.trim()).filter(Boolean)
    for (const segment of segments) {
      const expanded = expandAddressRange(segment)
      if (expanded.includes(canonicalNormalized)) {
        if (expanded[0]) {
          return addressToSlug(formatAddressForDisplay(expanded[0]))
        }
      }
    }
  }

  // 3. Last resort: canonical-derived slug. Carries unit suffix when the
  //    canonical does — but at this point we've exhausted cleaner sources.
  return addressToSlug(formatAddressForDisplay(canonicalNormalized))
}
