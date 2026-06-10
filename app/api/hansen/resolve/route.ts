// app/api/hansen/resolve/route.ts
//
// PUBLIC per-visitor Hansen resolution trigger. Fired by HansenResolveTrigger
// from the property page whenever an address misses all three archive sources
// (manual entries, approved user ranges, Hansen archive).
//
// Differs from the admin /api/hansen/lookup route in every protective layer:
//   - no auth (property search is free for everyone)
//   - archive re-check (idempotency — two tabs, stale client state)
//   - negative cache via hansen_lookups TTLs (never re-handshake a known miss)
//   - claim row in Postgres (cross-instance in-flight dedup — Vercel
//     instances share no memory, so the dedup must live in the DB)
//   - global rate cap (protect webapps1.chicago.gov from bursts)
//   - bot short-circuit (Googlebot executes JS; don't let a crawl of
//     /address/* become a crawl of the city site)
//
// All "nothing happened" outcomes return 200 with a status field rather than
// an error code — the client trigger is fire-and-mostly-forget and should
// never produce console noise for expected non-results.
//
// after() note: same pattern as the lookup route — the upsert + lookup-row
// finalize run post-response via after(); a bare floating promise would be
// killed when the function freezes.

import { NextResponse, after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  normalizeAddress,
  stripUnitSuffix,
  buildAddressRange,
} from '@/lib/supabase-search'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import { fetchHansenRecords, HansenFetchError } from '@/lib/hansen/fetch'
import { parseHansenResults } from '@/lib/hansen/parse'
import { upsertHansenData } from '@/lib/hansen/upsert'
import {
  resolveHansenArchive,
  isHansenRetryEligible,
  expandHansenRangeLines,
} from '@/lib/hansen/resolve'

// Node runtime — lib/hansen/fetch relies on Response.getSetCookie() (undici).
export const runtime = 'nodejs'
// Handshake (~3-8s) + parse + deferred upsert.
export const maxDuration = 60

// ── Global protection knobs ──────────────────────────────────────────────────
const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX_ATTEMPTS_PER_WINDOW = 20 // total claims/min across all instances
const MAX_CONCURRENT_IN_FLIGHT = 3      // simultaneous live handshakes
const IN_FLIGHT_STALE_MS = 90 * 1000    // matches HANSEN_RETRY_TTL_MS.in_flight

const BOT_UA_RE =
  /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|headless/i

export async function POST(request: Request) {
  // ── Bot short-circuit — costs nothing, claims nothing ─────────────────────
  const ua = request.headers.get('user-agent') ?? ''
  if (BOT_UA_RE.test(ua)) {
    return NextResponse.json({ status: 'skipped' })
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: { address?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  const rawAddress = body.address?.trim()
  if (!rawAddress || rawAddress.length > 120) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 })
  }
  const normalized = normalizeAddress(rawAddress)
  const baseAddress = stripUnitSuffix(normalized) ?? normalized
  if (!baseAddress) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // ── Archive re-check (idempotency) ─────────────────────────────────────────
  const archive = await resolveHansenArchive(baseAddress)
  if (archive.range) {
    return NextResponse.json({ status: 'already_resolved' })
  }

  // ── Negative cache ─────────────────────────────────────────────────────────
  const lookup = archive.lookup
  if (lookup && !isHansenRetryEligible(lookup)) {
    return NextResponse.json({
      status: lookup.status === 'in_flight' ? 'in_flight' : `cached_${lookup.status}`,
    })
  }

  // ── Global caps — checked BEFORE claiming ──────────────────────────────────
  try {
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
      (windowCount ?? 0) >= RATE_MAX_ATTEMPTS_PER_WINDOW ||
      (inFlightCount ?? 0) >= MAX_CONCURRENT_IN_FLIGHT
    ) {
      return NextResponse.json({ status: 'rate_limited' }, { status: 429 })
    }
  } catch {
    // Cap check failing should not block resolution — fall through.
  }

  // ── Claim ──────────────────────────────────────────────────────────────────
  // Fresh address: INSERT ... ON CONFLICT DO NOTHING; we won iff a row comes
  // back. Existing retryable row: optimistic-lock UPDATE matching the exact
  // attempted_at we read — a concurrent claimer changed it first and we lose.
  const nowIso = new Date().toISOString()
  let claimed = false
  try {
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
  } catch (e) {
    console.error(
      '[hansen/resolve] claim failed:',
      e instanceof Error ? e.message : String(e)
    )
    return NextResponse.json({ status: 'error' })
  }
  if (!claimed) {
    return NextResponse.json({ status: 'in_flight' })
  }

  // ── Handshake + parse (the critical path) ──────────────────────────────────
  let parsed: ReturnType<typeof parseHansenResults>
  try {
    const { html } = await fetchHansenRecords(baseAddress)
    parsed = parseHansenResults(html)
  } catch (e) {
    const isNotFound =
      e instanceof HansenFetchError &&
      e.step === 'validateaddress' &&
      /did not resolve/i.test(e.message)
    const errorStep =
      e instanceof HansenFetchError ? e.step : 'parse'
    try {
      await supabase
        .from('hansen_lookups')
        .update({
          status: isNotFound ? 'not_found' : 'error',
          error_step: errorStep,
          resolved_at: new Date().toISOString(),
        })
        .eq('searched_address', baseAddress)
    } catch {
      /* claim row stays in_flight; the 90s staleness window heals it */
    }
    if (!isNotFound) {
      console.error(
        '[hansen/resolve] handshake failed at',
        errorStep,
        '-',
        e instanceof Error ? e.message : String(e)
      )
    }
    return NextResponse.json({ status: isNotFound ? 'not_found' : 'error' })
  }

  // ── Range summary for the client banner ────────────────────────────────────
  const expanded = expandHansenRangeLines(parsed.range_addresses)
  const isMulti = expanded.length > 1
  const rangeText = isMulti ? buildAddressRange(expanded) : null
  const displayRange = rangeText
    ? rangeText
        .split(' & ')
        .map((part) => formatAddressForDisplay(part.trim()))
        .join(' & ')
    : null

  // ── Defer persist + lookup-row finalize ────────────────────────────────────
  after(async () => {
    try {
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
      console.log(
        '[hansen/resolve] persisted',
        baseAddress,
        JSON.stringify({ bldg_id: result.bldg_id, persisted: result.persisted })
      )
    } catch (e) {
      console.error(
        '[hansen/resolve] upsert failed (response already sent):',
        e instanceof Error ? e.message : String(e)
      )
      try {
        await supabase
          .from('hansen_lookups')
          .update({
            status: 'error',
            error_step: 'upsert',
            resolved_at: new Date().toISOString(),
          })
          .eq('searched_address', baseAddress)
      } catch {
        /* see above — staleness window heals an orphaned in_flight row */
      }
    }
  })

  // ── Respond immediately ─────────────────────────────────────────────────────
  return NextResponse.json({
    status: 'resolved',
    bldg_id: parsed.building?.bldg_id ?? null,
    is_empty: parsed.is_empty,
    is_multi: isMulti,
    display_range: displayRange,
    range_addresses: parsed.range_addresses,
    expanded_count: expanded.length,
  })
}