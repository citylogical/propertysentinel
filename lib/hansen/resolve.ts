// lib/hansen/resolve.ts
//
// Archive side of Hansen building resolution. Three jobs:
//
//   1. resolveHansenArchive(addr) — is this address already covered by a
//      persisted Hansen building? Checked by the property page as the third
//      range source (after manual entries and approved user ranges), and
//      re-checked by /api/hansen/resolve for idempotency.
//
//   2. isHansenRetryEligible(lookup) — the negative-cache gate. Decides
//      whether a prior hansen_lookups row blocks a fresh handshake.
//
//   3. expandHansenRangeLines(lines) — turn raw Hansen "Range address" lines
//      into normalized addresses (used by the resolve route to decide whether
//      a fresh result is multi-address and worth a banner).
//
// All reads, no writes — the resolve route owns hansen_lookups mutations.
//
// Address keying: everything here operates on the BASE address (unit suffix
// stripped via stripUnitSuffix). "6030 N SHERIDAN RD 102" and
// "6030 N SHERIDAN RD" must hit the same lookup row and the same ranges.

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeAddress, stripUnitSuffix } from '@/lib/supabase-search'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HansenLookupStatus =
  | 'in_flight'
  | 'resolved'
  | 'empty'
  | 'not_found'
  | 'error'

export type HansenLookupRow = {
  searched_address: string
  status: HansenLookupStatus
  bldg_id: string | null
  error_step: string | null
  attempted_at: string
  resolved_at: string | null
}

export type HansenArchiveRange = {
  /** Every address the building's ranges cover, normalized, deduped — plus the searched base address itself. */
  allAddresses: string[]
  /** All bldg_ids whose ranges cover the address (front building + coach house can both match). */
  bldgIds: string[]
}

export type HansenArchiveResolution = {
  /** Non-null = archive hit with a real multi-address range. */
  range: HansenArchiveRange | null
  /** The hansen_lookups row for the base address, if any. */
  lookup: HansenLookupRow | null
  /** True when the page should mount the client trigger (no blocking lookup row). */
  retryEligible: boolean
  /** The unit-suffix-stripped address everything was keyed on. */
  baseAddress: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative-cache TTLs
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

export const HANSEN_RETRY_TTL_MS: Partial<Record<HansenLookupStatus, number>> = {
  not_found: 30 * DAY_MS, // validateaddress rejected it — addresses don't appear overnight
  empty: 30 * DAY_MS,     // valid address, no DOB building record
  error: 60 * 60 * 1000,  // city-site transient — retry within the hour
  in_flight: 90 * 1000,   // a handshake claimed it; stale = the function died mid-run
}

/**
 * Should a fresh Hansen handshake be attempted given this lookup row?
 *   no row        → yes (never tried)
 *   resolved      → never (archive covers it; degenerate ranges included)
 *   anything else → only once the status's TTL has elapsed
 */
export function isHansenRetryEligible(
  lookup: HansenLookupRow | null,
  now: number = Date.now()
): boolean {
  if (!lookup) return true
  if (lookup.status === 'resolved') return false
  const ttl = HANSEN_RETRY_TTL_MS[lookup.status]
  if (ttl == null) return false
  const age = now - new Date(lookup.attempted_at).getTime()
  return Number.isFinite(age) ? age > ttl : false
}

// ─────────────────────────────────────────────────────────────────────────────
// Range expansion
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors the upsert.ts range-line regex: "1112-1134 N LA SALLE DR CHICAGO IL 60610". */
const RANGE_LINE_RE = /^(\d+)\s*-\s*(\d+)\s+(.*?)(?:\s+CHICAGO\s+IL\s+\d{5})?\s*$/i

/** Sanity cap — a parsed range wider than this is a bad parse, not a building. */
const MAX_RANGE_SPAN = 2000

/**
 * Enumerate addresses between low and high on one street, respecting parity
 * (one side of the street). Same semantics as enumerateAddressRange in
 * lib/supabase-search.ts.
 */
export function enumerateHansenRange(
  low: number,
  high: number,
  street: string
): string[] {
  const start = Math.min(low, high)
  const end = Math.max(low, high)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return []
  if (end - start > MAX_RANGE_SPAN) return []
  const parity = start % 2
  const out: string[] = []
  for (let n = start; n <= end; n++) {
    if (n % 2 === parity) out.push(`${n} ${street}`)
  }
  return out
}

/**
 * Expand raw Hansen "Range address" lines into normalized addresses.
 * Used by the resolve route on a FRESH parse result (before any DB rows
 * exist) to decide is_multi and build the banner text. Lines that don't
 * match the range pattern are skipped.
 */
export function expandHansenRangeLines(lines: string[]): string[] {
  const out = new Set<string>()
  for (const raw of lines) {
    const m = raw.toUpperCase().match(RANGE_LINE_RE)
    if (!m) continue
    const street = normalizeAddress(m[3] ?? '')
    if (!street) continue
    const low = parseInt(m[1] ?? '', 10)
    const high = parseInt(m[2] ?? '', 10)
    for (const a of enumerateHansenRange(low, high, street)) out.add(a)
  }
  return [...out]
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive lookup
// ─────────────────────────────────────────────────────────────────────────────

type RangeRow = {
  bldg_id: string
  low_number: number | null
  high_number: number | null
  street_normalized: string | null
}

/**
 * Resolve an address against the persisted Hansen archive.
 *
 * Two match paths, in order:
 *   (a) Exact — hansen_lookups.searched_address = base, status 'resolved'.
 *       Covers re-visits of any address that's been through resolution,
 *       including ones the parsed ranges don't literally contain (direction
 *       mismatches, the city's own normalization quirks).
 *   (b) Coverage — hansen_address_ranges rows on the same normalized street
 *       whose [low, high] contains the street number with matching parity.
 *       Covers sibling entrances of an already-resolved building that were
 *       never themselves searched.
 *
 * On a hit, ALL ranges for the matched bldg_id(s) are expanded and unioned —
 * a building fronting two streets fans out across both, same as Path D does
 * for manual entries.
 *
 * Returns range: null for misses AND for degenerate single-address buildings
 * (nothing to expand; the lookup row still suppresses the trigger).
 *
 * Fails closed: any DB error returns a miss with retryEligible false, so an
 * outage can't stampede the trigger.
 */
export async function resolveHansenArchive(
  normalizedAddress: string
): Promise<HansenArchiveResolution> {
  const baseAddress = stripUnitSuffix(normalizedAddress) ?? normalizedAddress
  const miss = (
    lookup: HansenLookupRow | null,
    retryEligible: boolean
  ): HansenArchiveResolution => ({ range: null, lookup, retryEligible, baseAddress })

  try {
    const supabase = getSupabaseAdmin()

    const { data: lookupData, error: lookupErr } = await supabase
      .from('hansen_lookups')
      .select('searched_address, status, bldg_id, error_step, attempted_at, resolved_at')
      .eq('searched_address', baseAddress)
      .maybeSingle()
    if (lookupErr) throw new Error(lookupErr.message)
    const lookup = (lookupData as HansenLookupRow | null) ?? null

    // (a) exact lookup hit
    let bldgIds: string[] = []
    if (lookup?.status === 'resolved' && lookup.bldg_id) {
      bldgIds = [lookup.bldg_id]
    }

    // (b) coverage match
    if (bldgIds.length === 0) {
      const parts = baseAddress.trim().split(/\s+/)
      const streetNum = parseInt(parts[0] ?? '', 10)
      const street = parts.slice(1).join(' ')
      if (!Number.isNaN(streetNum) && street.length > 3) {
        const { data: covRows, error: covErr } = await supabase
          .from('hansen_address_ranges')
          .select('bldg_id, low_number, high_number, street_normalized')
          .eq('street_normalized', street)
        if (covErr) throw new Error(covErr.message)
        const hits = ((covRows ?? []) as RangeRow[]).filter((r) => {
          if (r.low_number == null || r.high_number == null) return false
          const lo = Math.min(r.low_number, r.high_number)
          const hi = Math.max(r.low_number, r.high_number)
          if (hi - lo > MAX_RANGE_SPAN) return false
          return streetNum >= lo && streetNum <= hi && streetNum % 2 === lo % 2
        })
        bldgIds = [...new Set(hits.map((r) => r.bldg_id))]
      }
    }

    if (bldgIds.length === 0) {
      return miss(lookup, isHansenRetryEligible(lookup))
    }

    // Hit — pull every range for the matched building(s) and union.
    const { data: allRanges, error: rangesErr } = await supabase
      .from('hansen_address_ranges')
      .select('bldg_id, low_number, high_number, street_normalized')
      .in('bldg_id', bldgIds)
    if (rangesErr) throw new Error(rangesErr.message)

    const addrs = new Set<string>([baseAddress])
    for (const r of (allRanges ?? []) as RangeRow[]) {
      if (r.low_number == null || r.high_number == null || !r.street_normalized) continue
      for (const a of enumerateHansenRange(r.low_number, r.high_number, r.street_normalized)) {
        addrs.add(a)
      }
    }

    // Degenerate (single address, or ranges unparseable): known building,
    // nothing to expand. No range UI, and no trigger either — we already
    // know everything Hansen has to say about this address.
    if (addrs.size <= 1) {
      return miss(lookup, false)
    }

    return {
      range: { allAddresses: [...addrs], bldgIds },
      lookup,
      retryEligible: false,
      baseAddress,
    }
  } catch (e) {
    console.log(
      'resolveHansenArchive error:',
      e instanceof Error ? e.message : String(e)
    )
    return miss(null, false)
  }
}