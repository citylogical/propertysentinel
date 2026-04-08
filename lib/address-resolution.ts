import { getSupabaseAdmin } from './supabase-admin'

export type ResolvedProperty = {
  address_normalized: string
  pin: string
  pin10: string | null
  mailing_name: string | null
}

/** PostgREST `.or()` filter value — quote when commas/quotes/parens would break parsing. */
function quotePostgrestOrValue(v: string): string {
  if (v === '') return '""'
  if (/[",]/.test(v) || v.includes('(') || v.includes(')')) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return v
}

function orFilterForAddress(address: string): string[] {
  const a = address.trim()
  return [
    `address_normalized.eq.${quotePostgrestOrValue(a)}`,
    `address_normalized.like.${quotePostgrestOrValue(`${a} %`)}`,
  ]
}

/**
 * Resolves a bare address (e.g. "950 W HURON ST") to every PIN at that
 * physical building, including unit-suffixed PINs (e.g. "950 W HURON ST 201",
 * "950 W HURON ST P 18"). Used by the leads query enrichment, business trace
 * evaluation, multi-owner detection, and contacts-by-address routes.
 *
 * The match logic:
 *   - Exact equality: address_normalized = '950 W HURON ST'
 *   - Unit-suffixed prefix: address_normalized LIKE '950 W HURON ST %'
 *     (with trailing space — prevents matching "950 W HURON STREET")
 *
 * Returns one row per matching `properties` row (multiple tax years per PIN
 * may appear). Callers that need one row per PIN should dedupe on `pin`.
 */
export async function resolveAddressToProperties(address: string): Promise<ResolvedProperty[]> {
  if (!address || !address.trim()) return []
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('properties')
    .select('address_normalized, pin, pin10, mailing_name')
    .or(orFilterForAddress(address).join(','))
  return (data ?? []) as ResolvedProperty[]
}

/**
 * Batched version for the leads query enrichment hot path. Takes an array of
 * addresses and returns a Map keyed by the input address with the matching
 * properties for each. One round-trip to Supabase regardless of array size.
 */
export async function resolveAddressesToProperties(
  addresses: string[]
): Promise<Map<string, ResolvedProperty[]>> {
  const result = new Map<string, ResolvedProperty[]>()
  if (addresses.length === 0) return result

  const uniqueAddresses = [
    ...new Set(addresses.map((a) => a.trim()).filter((a) => a.length > 0)),
  ]
  if (uniqueAddresses.length === 0) return result

  const orFilter = uniqueAddresses.flatMap((a) => orFilterForAddress(a)).join(',')

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('properties')
    .select('address_normalized, pin, pin10, mailing_name')
    .or(orFilter)

  const allRows = (data ?? []) as ResolvedProperty[]

  for (const addr of uniqueAddresses) {
    const matches = allRows.filter(
      (r) =>
        r.address_normalized === addr ||
        (r.address_normalized?.startsWith(`${addr} `) ?? false)
    )
    result.set(addr, matches)
  }

  return result
}

/** Unique PINs among resolved rows (properties may repeat PIN across tax years). */
export function uniquePinCount(properties: ResolvedProperty[]): number {
  return new Set(properties.map((p) => p.pin).filter(Boolean)).size
}

/**
 * Counts unique mailing names across a set of properties. Used for the
 * multi-owner building rule (7+ PINs AND 2+ distinct mailing names).
 */
export function countDistinctMailingNames(properties: ResolvedProperty[]): number {
  const names = new Set<string>()
  for (const p of properties) {
    const n = (p.mailing_name ?? '').trim().toUpperCase()
    if (n) names.add(n)
  }
  return names.size
}
