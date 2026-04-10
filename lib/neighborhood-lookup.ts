import 'server-only'

import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * Chicago neighborhood spatial lookup.
 *
 * Sourced from Chicago's official neighborhoods polygon dataset
 * (Socrata y6yq-dbs2, ~98 polygons). Each polygon has a primary
 * neighborhood name (pri_neigh) like "Wicker Park" or "Lincoln Park".
 *
 * We only use pri_neigh for display. The containing area shown in
 * parentheses ("Wicker Park (West Town)") comes from the existing
 * static community area lookup, NOT from sec_neigh in this dataset.
 *
 * The DB function lookup_chicago_neighborhood does the point-in-polygon
 * query via PostGIS ST_Contains. Wrapped in unstable_cache for 1 hour
 * because neighborhood boundaries do not change often.
 */

export type NeighborhoodLookup = {
  priNeigh: string
} | null

async function lookupNeighborhoodUncached(lat: number, lng: number): Promise<NeighborhoodLookup> {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    return null
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('lookup_chicago_neighborhood', {
    p_lat: lat,
    p_lng: lng,
  })

  if (error) {
    console.warn('[neighborhood-lookup] RPC error:', error.message)
    return null
  }

  if (!data || !Array.isArray(data) || data.length === 0) return null

  const row = data[0] as { pri_neigh?: string }
  if (!row.pri_neigh) return null

  return { priNeigh: row.pri_neigh }
}

/**
 * Cached spatial lookup. Cache key includes lat/lng via unstable_cache args.
 * 1-hour TTL.
 */
export const lookupNeighborhood = unstable_cache(
  lookupNeighborhoodUncached,
  ['chicago-neighborhood-lookup-v1'],
  { revalidate: 3600 }
)

/**
 * Format a neighborhood + community area for header display.
 *
 *   - If priNeigh exists AND differs from communityArea (case-insensitive),
 *     returns "PRI_NEIGH (COMMUNITY_AREA)"  → "WICKER PARK (WEST TOWN)"
 *   - If priNeigh exists AND matches communityArea, returns just priNeigh
 *     → "LINCOLN PARK"
 *   - If no priNeigh, returns the community area unchanged (uppercased), or null.
 */
export function formatNeighborhoodWithCommunityArea(
  lookup: NeighborhoodLookup,
  communityArea: string | null
): string | null {
  if (!lookup) return communityArea ? communityArea.toUpperCase() : null

  const pri = lookup.priNeigh.toUpperCase()
  if (!communityArea) return pri

  const ca = communityArea.toUpperCase()
  if (pri === ca) return pri

  return `${pri} (${ca})`
}
