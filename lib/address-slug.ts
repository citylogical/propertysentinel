import { normalizeAddress } from './supabase-search'

/**
 * Convert a URL slug (e.g. "2847-N-Kedzie-Ave-Chicago-60618") to the street part
 * for display (e.g. "2847 N Kedzie Ave"). Drops "Chicago" and zip if present.
 */
export function slugToDisplayAddress(slug: string): string {
  const decoded = decodeURIComponent(slug.trim())
  const parts = decoded.split('-').filter(Boolean)
  if (parts.length === 0) return decoded
  const chicagoIdx = parts.map((p) => p.toLowerCase()).indexOf('chicago')
  const streetParts =
    chicagoIdx >= 0 ? parts.slice(0, chicagoIdx) : parts.filter((p) => !/^\d{5}$/.test(p))
  return streetParts.join(' ').trim() || decoded
}

/**
 * Convert slug to normalized address for DB lookup (uppercase + abbreviated).
 */
export function slugToNormalizedAddress(slug: string): string {
  const display = slugToDisplayAddress(slug)
  return normalizeAddress(display)
}

/**
 * Convert an address string to a URL slug (hyphen-separated).
 * e.g. "2847 N Kedzie Ave" → "2847-N-Kedzie-Ave"
 */
export function addressToSlug(address: string): string {
  return address.trim().replace(/\s+/g, '-')
}

/**
 * Extract 5-digit zip from slug if present (e.g. "...-60618").
 */
export function slugToZip(slug: string): string | null {
  const decoded = decodeURIComponent(slug.trim())
  const parts = decoded.split('-')
  const last = parts[parts.length - 1]
  return /^\d{5}$/.test(last ?? '') ? last : null
}
