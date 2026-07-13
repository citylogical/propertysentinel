// lib/hansen/ensure.ts
//
// Server-side "make sure Hansen knows this address" — the same archive-first
// → negative-cache → claim → handshake → persist sequence as the public
// /api/hansen/resolve route, packaged for callers that live inside a
// long-running request (the rent-roll import resolver). Two deliberate
// differences from the route:
//
//   - persist runs SYNCHRONOUSLY (the route defers via after(); here the
//     caller controls its own time budget and needs the archive consistent
//     before it reads the result)
//   - the global rate check takes a caller-supplied headroom so a bulk
//     import can leave capacity for live visitors instead of consuming the
//     whole 20/min window
//
// Returns the building's expanded multi-address range on a hit (archive or
// fresh), null when there is nothing to expand (single-address building,
// known miss, negative-cached, rate-limited, lost claim, or error). Callers
// treat null as "no definitive range — keep what you had". Never throws.

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchHansenRecords, HansenFetchError } from '@/lib/hansen/fetch'
import { parseHansenResults } from '@/lib/hansen/parse'
import { upsertHansenData } from '@/lib/hansen/upsert'
import {
  resolveHansenArchive,
  isHansenRetryEligible,
  expandHansenRangeLines,
} from '@/lib/hansen/resolve'

const RATE_WINDOW_MS = 60 * 1000
const IN_FLIGHT_STALE_MS = 90 * 1000
const MAX_CONCURRENT_IN_FLIGHT = 3

export type EnsureHansenResult = {
  /** Every address the building covers, normalized (includes the base). */
  allAddresses: string[]
  source: 'archive' | 'live'
}

export async function ensureHansenRecord(
  baseAddress: string,
  opts?: {
    /** Skip the live handshake when the rolling window already has this many attempts (default 15 of the public route's 20). */
    maxWindowAttempts?: number
  }
): Promise<EnsureHansenResult | null> {
  const maxWindowAttempts = opts?.maxWindowAttempts ?? 15

  try {
    const supabase = getSupabaseAdmin()

    // Archive first — an existing record (including coverage by a sibling
    // entrance's range) is definitive and costs one DB read.
    const archive = await resolveHansenArchive(baseAddress)
    if (archive.range) {
      return { allAddresses: archive.range.allAddresses, source: 'archive' }
    }

    // Negative cache — a known miss inside its TTL is an answer, not a gap.
    const lookup = archive.lookup
    if (lookup && !isHansenRetryEligible(lookup)) return null

    // Global caps — leave headroom for live visitors (the public route
    // allows 20 claims/min; a bulk import must not eat the whole window).
    const windowCutoff = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const inFlightCutoff = new Date(Date.now() - IN_FLIGHT_STALE_MS).toISOString()
    const [{ count: windowCount }, { count: inFlightCount }] = await Promise.all([
      supabase
        .from('hansen_lookups')
        .select('searched_address', { count: 'exact', head: true })
        .gte('attempted_at', windowCutoff),
      supabase
        .from('hansen_lookups')
        .select('searched_address', { count: 'exact', head: true })
        .eq('status', 'in_flight')
        .gte('attempted_at', inFlightCutoff),
    ])
    if (
      (windowCount ?? 0) >= maxWindowAttempts ||
      (inFlightCount ?? 0) >= MAX_CONCURRENT_IN_FLIGHT
    ) {
      return null
    }

    // Claim — identical semantics to the public route (cross-instance dedup).
    const nowIso = new Date().toISOString()
    let claimed = false
    if (!lookup) {
      const { data, error } = await supabase
        .from('hansen_lookups')
        .upsert(
          { searched_address: baseAddress, status: 'in_flight', attempted_at: nowIso },
          { onConflict: 'searched_address', ignoreDuplicates: true }
        )
        .select('searched_address')
      if (error) throw new Error(error.message)
      claimed = (data?.length ?? 0) > 0
    } else {
      const { data, error } = await supabase
        .from('hansen_lookups')
        .update({ status: 'in_flight', attempted_at: nowIso, error_step: null })
        .eq('searched_address', baseAddress)
        .eq('attempted_at', lookup.attempted_at)
        .select('searched_address')
      if (error) throw new Error(error.message)
      claimed = (data?.length ?? 0) > 0
    }
    if (!claimed) return null

    // Handshake + parse.
    let parsed: ReturnType<typeof parseHansenResults>
    try {
      const { html } = await fetchHansenRecords(baseAddress)
      parsed = parseHansenResults(html)
    } catch (e) {
      const isNotFound =
        e instanceof HansenFetchError &&
        e.step === 'validateaddress' &&
        /did not resolve/i.test(e.message)
      const errorStep = e instanceof HansenFetchError ? e.step : 'parse'
      await supabase
        .from('hansen_lookups')
        .update({
          status: isNotFound ? 'not_found' : 'error',
          error_step: errorStep,
          resolved_at: new Date().toISOString(),
        })
        .eq('searched_address', baseAddress)
      if (!isNotFound) {
        console.error(
          '[ensureHansenRecord] handshake failed at',
          errorStep,
          '-',
          e instanceof Error ? e.message : String(e)
        )
      }
      return null
    }

    // Persist + finalize the lookup row synchronously.
    const result = await upsertHansenData(parsed)
    await supabase
      .from('hansen_lookups')
      .update({
        status: result.persisted ? 'resolved' : 'empty',
        bldg_id: result.bldg_id,
        error_step: null,
        resolved_at: new Date().toISOString(),
      })
      .eq('searched_address', baseAddress)

    const expanded = expandHansenRangeLines(parsed.range_addresses)
    if (expanded.length <= 1) return null
    return {
      allAddresses: [...new Set([baseAddress, ...expanded])],
      source: 'live',
    }
  } catch (e) {
    console.error(
      '[ensureHansenRecord] error:',
      e instanceof Error ? e.message : String(e)
    )
    return null
  }
}
