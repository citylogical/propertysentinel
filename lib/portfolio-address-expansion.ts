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
 * page from a dashboard context (Portfolio detail panel, Activity Feed).
 *
 * When address_range is non-null, the returned slug is derived from the first
 * expanded address (e.g., "737 W CORNELIA AVE" from range "737-747 W CORNELIA
 * AVE"). That address is guaranteed to appear in user_building_ranges, so the
 * address page's findApprovedUserRange lookup succeeds and ?building=true
 * expands to the full range immediately — no BuildingDetectionModal modal.
 *
 * The stored portfolio_properties.slug is unsuitable when the canonical
 * address carries a unit suffix (e.g., "739 W CORNELIA AVE N-1") that is
 * not in the expanded range — the lookup misses and the page falls back to
 * single-address view despite ?building=true. This helper fixes that
 * mismatch. Falls back to the stored slug when no range exists.
 */
export function getPortfolioBuildingSlug(
  canonicalAddress: string,
  addressRange: string | null,
  storedSlug: string | null
): string {
  // Default range anchor is the canonical-address slug. We override only when the
  // canonical address appears inside one of the address_range segments — confirms
  // the range and canonical are on the same street, so deriving from the range
  // is safe and gets findApprovedUserRange's lookup right.
  //
  // 600 N LAKE SHORE DR (canonical) + 460-460 E OHIO ST (range, different street)
  // would previously route the user to 460 E Ohio St — wrong page. Now we check
  // whether canonical is actually covered by the range; if not, use canonical.
  const canonicalNormalized = canonicalAddress.toUpperCase().replace(/\s+/g, ' ').trim()

  if (addressRange?.trim()) {
    const segments = addressRange.split('&').map((s) => s.trim()).filter(Boolean)
    for (const segment of segments) {
      const expanded = expandAddressRange(segment)
      if (expanded.includes(canonicalNormalized)) {
        // Canonical is in this segment — safe to use range anchor.
        if (expanded[0]) {
          return addressToSlug(formatAddressForDisplay(expanded[0]))
        }
      }
    }
    // No segment covers the canonical — fall through to canonical/stored slug
    // since deriving from range would land on the wrong street.
  }

  // Prefer canonical-derived slug over storedSlug since storedSlug can carry
  // bad data (wrong zip from a Palatine-vs-Chicago Google geocoding miss).
  return addressToSlug(formatAddressForDisplay(canonicalNormalized))
}
