// scripts/hansen-portfolio-backfill.ts
//
// One-time backfill: runs the Hansen (webapps1.chicago.gov/buildingrecords)
// pipeline for every portfolio_properties row belonging to a target user,
// persists the hansen_* tables, and — where Hansen returns a cleanly parseable
// address range — overwrites the row's address_range / additional_streets and
// re-resolves its PIN set.
//
// ── HOW TO RUN ───────────────────────────────────────────────────────────────
//   tsx --env-file=.env.local scripts/hansen-portfolio-backfill.ts
//
//   The --env-file flag is REQUIRED, not optional. lib/supabase.ts reads
//   NEXT_PUBLIC_SUPABASE_URL into a module-scoped const at load time; if the
//   env isn't populated before the first import resolves, createClient() throws
//   "supabaseUrl is required" before this script does anything. --env-file
//   populates process.env at the Node level, before any module evaluates.
//
//   Dry run (no writes, just reports what WOULD happen):
//     tsx --env-file=.env.local scripts/hansen-portfolio-backfill.ts --dry-run
//
//   Target a different user (defaults to the jrmcmahon mirror):
//     tsx --env-file=.env.local scripts/hansen-portfolio-backfill.ts --user=user_XXXX
//
// ── WHAT IT DOES, PER ROW ────────────────────────────────────────────────────
//   1. fetchHansenRecords(canonical_address) → raw doSearch HTML
//   2. parseHansenResults(html)              → typed HansenParseResult
//   3. upsertHansenData(parsed)              → persists the hansen_* tables
//   4. If a building was persisted: stamp hansen_bldg_id + hansen_backfilled_at
//      on the portfolio_properties row.
//   5. If Hansen returned >=1 cleanly parseable range: overwrite address_range
//      (first clean range), push the rest to additional_streets[], re-resolve
//      PINs from the clean ranges, UNION with the existing pins array, write back.
//      Otherwise address_range / additional_streets / pins are left UNTOUCHED.
//
// ── RESUMABILITY ─────────────────────────────────────────────────────────────
//   Rows with hansen_backfilled_at already set are SKIPPED. A crash mid-run is
//   safe — just re-run the same command and it picks up where it left off.
//   Use --force to re-process already-stamped rows.
//
// ── SAFETY ───────────────────────────────────────────────────────────────────
//   Default target is the MIRROR portfolio (jrmcmahon94). GC Realty's real
//   portfolio is the backup. Run against the mirror, eyeball the summary, and
//   only then decide to re-mirror the corrected rows over to GC.
//
//   This script REQUIRES two columns to exist on portfolio_properties:
//     alter table portfolio_properties add column hansen_bldg_id text;
//     alter table portfolio_properties add column hansen_backfilled_at timestamptz;
//     create index on portfolio_properties (hansen_bldg_id);
//   It checks for them on startup and bails with a clear message if absent.

import { getSupabaseAdmin } from '../lib/supabase'
import { fetchHansenRecords, HansenFetchError } from '../lib/hansen/fetch'
import { parseHansenResults } from '../lib/hansen/parse'
import { upsertHansenData } from '../lib/hansen/upsert'
import {
  normalizeAddress,
  collectPinsForUserRangeAddresses,
} from '../lib/supabase-search'

// ─────────────────────────────────────────────────────────────────────────────
// Config / CLI args
// ─────────────────────────────────────────────────────────────────────────────

// The jrmcmahon94@gmail.com mirror — the SAFE default target.
const DEFAULT_TARGET_USER = 'user_3BBPo3OLOM46aZbnBFg99iXsiIg'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const userArg = args.find((a) => a.startsWith('--user='))
const TARGET_USER = userArg ? userArg.slice('--user='.length) : DEFAULT_TARGET_USER
const limitArg = args.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : null
// --retry-display-name: a second-pass mode. Instead of processing not-yet-done
// rows on canonical_address, it RE-processes the rows that previously failed
// (no hansen_bldg_id stamped) using display_name as the query string — but only
// for rows whose display_name looks like an address (starts with a digit).
// This catches unit-suffixed canonical_addresses whose display_name was saved
// de-suffixed by the rent-roll importer (e.g. "1505 N MAPLEWOOD AVE 1" →
// display_name "1505 N Maplewood Ave"), which Hansen can resolve.
const RETRY_DISPLAY_NAME = args.includes('--retry-display-name')

// Politeness delay between Hansen queries — the city's server is not ours to
// hammer. ~2.5s + the natural latency of the 5-request handshake keeps us to a
// modest request rate. Bumped from 1200ms after a Proxy Error during a partial
// re-run; the city's buildingrecords app is old infrastructure and we're being
// a good citizen. 351 rows ≈ 50-70 min wall time at this rate.
const DELAY_MS = 2500

// The "clean range" regex. THIS IS A DELIBERATE COPY of the regex in
// lib/hansen/upsert.ts (hansen_address_ranges parsing). "Clean" must mean the
// SAME thing in both places — if you ever tighten one, tighten the other.
const CLEAN_RANGE_RE = /^(\d+)\s*-\s*(\d+)\s+(.*?)(?:\s+CHICAGO\s+IL\s+\d{5})?\s*$/i

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PortfolioRow = {
    id: string
    canonical_address: string
    display_name: string | null
    address_range: string | null
    additional_streets: string[] | null
    pins: string[] | null
    hansen_bldg_id: string | null
    hansen_backfilled_at: string | null
  }

type RowStatus = 'resolved' | 'no_hansen_record' | 'range_unresolved' | 'error'

type RowOutcome = {
  id: string
  canonical_address: string
  status: RowStatus
  bldg_id: string | null
  detail?: string
  // Only populated on 'resolved':
  newAddressRange?: string | null
  newAdditionalStreets?: string[]
  pinsBefore?: number
  pinsAfter?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** A parsed clean range: low/high/street, plus the normalized "low-high STREET" form. */
type CleanRange = {
  low: number
  high: number
  street: string
  /** e.g. "1600-1608 N MILWAUKEE AVE" — normalized, city/zip stripped. */
  normalized: string
}

/**
 * Apply CLEAN_RANGE_RE to each raw range_addresses entry. Returns only the
 * entries that matched, in page order. Non-matching entries are dropped here
 * (they're still captured verbatim in hansen_address_ranges by upsertHansenData
 * — nothing is lost, they're just not promoted onto the portfolio row).
 */
function extractCleanRanges(rangeAddresses: string[]): CleanRange[] {
  const out: CleanRange[] = []
  for (const raw of rangeAddresses) {
    const m = raw.match(CLEAN_RANGE_RE)
    if (!m) continue
    const low = parseInt(m[1], 10)
    const high = parseInt(m[2], 10)
    const street = m[3].trim()
    if (!Number.isFinite(low) || !Number.isFinite(high) || !street) continue
    out.push({
      low,
      high,
      street,
      normalized: `${low}-${high} ${street}`.toUpperCase().replace(/\s+/g, ' ').trim(),
    })
  }
  return out
}

/**
 * Expand a clean range into individual normalized addresses, respecting
 * even/odd parity (one side of the street). Mirrors enumerateAddressRange in
 * lib/supabase-search.ts — kept local so the script has no dependency on a
 * non-exported helper.
 */
function expandCleanRange(r: CleanRange): string[] {
  const start = Math.min(r.low, r.high)
  const end = Math.max(r.low, r.high)
  const parity = start % 2
  const addrs: string[] = []
  for (let n = start; n <= end; n++) {
    if (n % 2 === parity) addrs.push(normalizeAddress(`${n} ${r.street}`))
  }
  return addrs
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup checks
// ─────────────────────────────────────────────────────────────────────────────

async function assertSchema(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<void> {
  // Cheap existence probe: select the two columns from a 1-row query. If the
  // columns don't exist, supabase-js returns a PostgREST error we can read.
  const { error } = await supabase
    .from('portfolio_properties')
    .select('hansen_bldg_id, hansen_backfilled_at')
    .limit(1)
  if (error) {
    console.error(
      '\n✖ Schema check failed. This script needs two columns on ' +
        'portfolio_properties that do not appear to exist:\n\n' +
        '    alter table portfolio_properties add column hansen_bldg_id text;\n' +
        '    alter table portfolio_properties add column hansen_backfilled_at timestamptz;\n' +
        '    create index on portfolio_properties (hansen_bldg_id);\n\n' +
        `  PostgREST said: ${error.message}\n`
    )
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-row processing
// ─────────────────────────────────────────────────────────────────────────────

async function processRow(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    row: PortfolioRow,
    queryAddress: string
  ): Promise<RowOutcome> {
    const { id, canonical_address } = row
  
    // ── 1-2. Fetch + parse ─────────────────────────────────────────────────
    // queryAddress is what we actually send to Hansen — normally
    // canonical_address, but display_name in --retry-display-name mode.
    let parsed
    try {
      const { html } = await fetchHansenRecords(queryAddress)
      parsed = parseHansenResults(html)
  } catch (e) {
    if (e instanceof HansenFetchError) {
      // validateaddress failure = the city couldn't resolve the address to a
      // building. That's "no record", not a transport error.
      if (e.step === 'validateaddress') {
        return {
          id,
          canonical_address,
          status: 'no_hansen_record',
          bldg_id: null,
          detail: 'address did not resolve in Hansen',
        }
      }
      // Any other step (landing / agreement / search-form / doSearch) is a
      // transport or structural failure. Worth a retry on a later run.
      return {
        id,
        canonical_address,
        status: 'error',
        bldg_id: null,
        detail: `fetch failed at step "${e.step}": ${e.message}`,
      }
    }
    // parseHansenResults throws plain Errors on structurally-unexpected HTML.
    return {
      id,
      canonical_address,
      status: 'error',
      bldg_id: null,
      detail: e instanceof Error ? e.message : String(e),
    }
  }

  // ── 3. Persist the hansen_* tables ─────────────────────────────────────
  let upsertResult
  try {
    if (DRY_RUN) {
      // In a dry run we still parse, but we don't write the hansen_* tables.
      // Synthesize what upsertHansenData WOULD have returned for status logic.
      upsertResult = {
        bldg_id: parsed.building?.bldg_id ?? null,
        persisted: parsed.building != null,
      }
    } else {
      upsertResult = await upsertHansenData(parsed)
    }
  } catch (e) {
    return {
      id,
      canonical_address,
      status: 'error',
      bldg_id: parsed.building?.bldg_id ?? null,
      detail: `hansen upsert failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // persisted: false ⟺ no building key at all (valid address, no DOB record,
  // no inspection links to synthesize an addr:-keyed building from).
  if (!upsertResult.persisted || !upsertResult.bldg_id) {
    return {
      id,
      canonical_address,
      status: 'no_hansen_record',
      bldg_id: null,
      detail: 'Hansen returned a page but no building record',
    }
  }

  const bldgId = upsertResult.bldg_id

  // ── 4. Stamp hansen_bldg_id + hansen_backfilled_at ─────────────────────
  // This happens for EVERY row that resolved to a building, regardless of
  // whether the range was promotable. It's how resumability works.
  const nowIso = new Date().toISOString()
  if (!DRY_RUN) {
    const { error: stampErr } = await supabase
      .from('portfolio_properties')
      .update({ hansen_bldg_id: bldgId, hansen_backfilled_at: nowIso })
      .eq('id', id)
    if (stampErr) {
      return {
        id,
        canonical_address,
        status: 'error',
        bldg_id: bldgId,
        detail: `stamp update failed: ${stampErr.message}`,
      }
    }
  }

  // ── 5. Promote the range, if Hansen gave us a clean one ────────────────
  const cleanRanges = extractCleanRanges(parsed.range_addresses)

  if (cleanRanges.length === 0) {
    // We have a building, but nothing promotable. Leave address_range / pins
    // EXACTLY as they were. hansen_bldg_id is already stamped above.
    return {
      id,
      canonical_address,
      status: 'range_unresolved',
      bldg_id: bldgId,
      detail:
        parsed.range_addresses.length > 0
          ? `${parsed.range_addresses.length} range line(s), none matched the clean-range regex`
          : 'Hansen returned no range lines',
    }
  }

  // First clean range → address_range. Rest → additional_streets[].
  const newAddressRange = cleanRanges[0].normalized
  const newAdditionalStreets = cleanRanges.slice(1).map((r) => r.normalized)

  // Re-resolve PINs from ALL clean ranges. Expand each to parity-stepped
  // addresses, dedupe, then hand to the existing resolver.
  const expandedAddrs = [
    ...new Set(cleanRanges.flatMap((r) => expandCleanRange(r))),
  ]
  let hansenPins: string[] = []
  try {
    hansenPins = await collectPinsForUserRangeAddresses(expandedAddrs)
  } catch (e) {
    // PIN resolution failed — but the hansen_* data and the bldg_id stamp are
    // already persisted. Treat as range_unresolved (conservative: don't
    // overwrite address_range when we couldn't get a trustworthy PIN set).
    return {
      id,
      canonical_address,
      status: 'range_unresolved',
      bldg_id: bldgId,
      detail: `PIN re-resolution threw: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // UNION Hansen-resolved PINs with whatever was already on the row.
  const existingPins = row.pins ?? []
  const unionPins = [...new Set([...existingPins, ...hansenPins])]

  if (!DRY_RUN) {
    const { error: promoteErr } = await supabase
      .from('portfolio_properties')
      .update({
        address_range: newAddressRange,
        additional_streets: newAdditionalStreets.length > 0 ? newAdditionalStreets : null,
        pins: unionPins,
        updated_at: nowIso,
      })
      .eq('id', id)
    if (promoteErr) {
      return {
        id,
        canonical_address,
        status: 'error',
        bldg_id: bldgId,
        detail: `range/pins promote update failed: ${promoteErr.message}`,
      }
    }
  }

  return {
    id,
    canonical_address,
    status: 'resolved',
    bldg_id: bldgId,
    newAddressRange,
    newAdditionalStreets,
    pinsBefore: existingPins.length,
    pinsAfter: unionPins.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabase = getSupabaseAdmin()

  console.log('─'.repeat(72))
  console.log('Hansen portfolio backfill')
  console.log('─'.repeat(72))
  console.log(`  target user : ${TARGET_USER}`)
  console.log(`  mode        : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (writes enabled)'}`)
  console.log(`  force       : ${FORCE ? 'yes — re-process stamped rows' : 'no — skip stamped rows'}`)
  console.log(`  delay       : ${DELAY_MS}ms between queries`)
  console.log('─'.repeat(72))

  await assertSchema(supabase)

  // Fetch the target user's portfolio rows.
  const { data: allRows, error: fetchErr } = await supabase
    .from('portfolio_properties')
    .select(
        'id, canonical_address, display_name, address_range, additional_streets, pins, hansen_bldg_id, hansen_backfilled_at'
      )
    .eq('user_id', TARGET_USER)
    .order('canonical_address', { ascending: true })

  if (fetchErr) {
    console.error(`✖ Failed to fetch portfolio rows: ${fetchErr.message}`)
    process.exit(1)
  }

  const rows = (allRows ?? []) as PortfolioRow[]
  if (rows.length === 0) {
    console.error(`✖ No portfolio_properties rows found for user ${TARGET_USER}`)
    process.exit(1)
  }

  // Row selection. Two modes:
  //   normal:               process rows not yet stamped (resumable forward walk)
  //   --retry-display-name: RE-process previously-failed rows (no bldg_id stamped)
  //                         whose display_name looks like an address, querying
  //                         Hansen with display_name instead of canonical_address.
  let afterResume: PortfolioRow[]
  if (RETRY_DISPLAY_NAME) {
    afterResume = rows.filter((r) => {
      // Failed rows only: no bldg_id stamped. (range_unresolved rows DID get a
      // bldg_id — they resolved to a building, retrying won't surface a range.)
      if (r.hansen_bldg_id) return false
      // display_name must look like an address — starts with a street number.
      const dn = (r.display_name ?? '').trim()
      return /^\d/.test(dn)
    })
  } else {
    afterResume = FORCE ? rows : rows.filter((r) => !r.hansen_backfilled_at)
  }
  // --limit caps the run AFTER the selection filter.
  const todo =
    LIMIT != null && Number.isFinite(LIMIT) && LIMIT > 0
      ? afterResume.slice(0, LIMIT)
      : afterResume
  const skipped = rows.length - afterResume.length

  console.log(`  ${rows.length} total rows · ${skipped} already done · ${todo.length} to process`)
  if (todo.length === 0) {
    console.log('\n✔ Nothing to do — every row is already backfilled. (Use --force to redo.)')
    return
  }
  const estMin = Math.ceil((todo.length * (DELAY_MS + 6000)) / 60000)
  console.log(`  estimated wall time: ~${estMin} min\n`)

  const outcomes: RowOutcome[] = []

  for (let i = 0; i < todo.length; i++) {
    const row = todo[i]
    const n = `[${i + 1}/${todo.length}]`
    process.stdout.write(`${n} ${row.canonical_address} … `)

    let outcome: RowOutcome
    try {
        outcome = await processRow(
            supabase,
            row,
            RETRY_DISPLAY_NAME ? (row.display_name ?? row.canonical_address) : row.canonical_address
          )
    } catch (e) {
      // Catch-all so one unexpected throw can't kill the whole run.
      outcome = {
        id: row.id,
        canonical_address: row.canonical_address,
        status: 'error',
        bldg_id: null,
        detail: `unhandled: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
    outcomes.push(outcome)

    // One-line status.
    switch (outcome.status) {
      case 'resolved':
        console.log(
          `✔ resolved · bldg ${outcome.bldg_id} · range "${outcome.newAddressRange}"` +
            (outcome.newAdditionalStreets && outcome.newAdditionalStreets.length > 0
              ? ` +${outcome.newAdditionalStreets.length} more`
              : '') +
            ` · pins ${outcome.pinsBefore}→${outcome.pinsAfter}`
        )
        break
      case 'range_unresolved':
        console.log(`◐ range_unresolved · bldg ${outcome.bldg_id} · ${outcome.detail}`)
        break
      case 'no_hansen_record':
        console.log(`○ no_hansen_record · ${outcome.detail}`)
        break
      case 'error':
        console.log(`✖ error · ${outcome.detail}`)
        break
    }

    // Politeness delay — skip after the final row.
    if (i < todo.length - 1) await sleep(DELAY_MS)
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const by = (s: RowStatus) => outcomes.filter((o) => o.status === s)
  const resolved = by('resolved')
  const rangeUnresolved = by('range_unresolved')
  const noRecord = by('no_hansen_record')
  const errored = by('error')

  console.log('\n' + '─'.repeat(72))
  console.log('SUMMARY')
  console.log('─'.repeat(72))
  console.log(`  ✔ resolved          ${resolved.length}`)
  console.log(`  ◐ range_unresolved  ${rangeUnresolved.length}`)
  console.log(`  ○ no_hansen_record  ${noRecord.length}`)
  console.log(`  ✖ error             ${errored.length}`)
  console.log(`  ── processed        ${outcomes.length} / ${todo.length}`)

  if (errored.length > 0) {
    console.log('\n  Errored rows (safe to re-run — resumable):')
    for (const o of errored) {
      console.log(`    • ${o.canonical_address} — ${o.detail}`)
    }
  }
  if (rangeUnresolved.length > 0) {
    console.log('\n  range_unresolved rows (bldg_id stamped, address_range untouched):')
    for (const o of rangeUnresolved) {
      console.log(`    • ${o.canonical_address} — ${o.detail}`)
    }
  }
  if (noRecord.length > 0) {
    console.log('\n  no_hansen_record rows (nothing stamped, nothing changed):')
    for (const o of noRecord) {
      console.log(`    • ${o.canonical_address} — ${o.detail}`)
    }
  }

  if (DRY_RUN) {
    console.log('\n  DRY RUN — no database writes were made.')
  }
  console.log('─'.repeat(72))
}

main().catch((e) => {
  console.error('\n✖ Fatal:', e instanceof Error ? e.stack ?? e.message : String(e))
  process.exit(1)
})