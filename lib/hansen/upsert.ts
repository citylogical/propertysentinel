// lib/hansen/upsert.ts
//
// Persists a parsed Hansen result into the five hansen_* tables.
//
// Idempotent by design: re-running a lookup for the same building upserts
// cleanly via each table's unique constraint. Hansen records are historically
// append-only — a building only ever GAINS inspections/violations/permits/
// cases over time, it never loses them — so upsert-on-conflict is both
// non-destructive and correct. No delete-then-insert needed.
//
// Not transactional: supabase-js can't span a multi-statement transaction
// without an RPC. If hansen_buildings succeeds but a child table fails, the
// throw surfaces it in logs and the next re-run heals it (every write is an
// idempotent upsert). For an append-only source that's an acceptable trade.

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { HansenParseResult } from './parse'

export type HansenUpsertResult = {
  bldg_id: string | null
  persisted: boolean
  buildings: number
  permits: number
  enforcement_cases: number
  inspections: number
  violations: number
  address_ranges: number
  addr_ids: number
}

/**
 * Drop rows that share a conflict key within the same batch.
 *
 * Postgres rejects an ON CONFLICT upsert where the same target tuple appears
 * twice in one statement ("cannot affect row a second time"). The parser
 * shouldn't emit dupes, but the city's HTML is the city's HTML — this is cheap
 * insurance, and it matches the dedupe discipline already used in the
 * rent-roll importer.
 */
function dedupeBy<T>(rows: T[], keyFn: (row: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    const k = keyFn(r)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

export async function upsertHansenData(
  parsed: HansenParseResult
): Promise<HansenUpsertResult> {
  const empty: HansenUpsertResult = {
    bldg_id: null,
    persisted: false,
    buildings: 0,
    permits: 0,
    enforcement_cases: 0,
    inspections: 0,
    violations: 0,
    address_ranges: 0,
    addr_ids: 0,
  }

  // No Building Attributes row → no bldg_id to key the child tables on.
  // (The address may have resolved to a range with no DOB building record.)
  // Nothing to persist; the route still returns the range to the frontend.
  if (!parsed.building) return empty

  const supabase = getSupabaseAdmin()
  const bldgId = parsed.building.bldg_id
  const fetchedAt = new Date().toISOString()

  // ── hansen_buildings (the spine) ─────────────────────────────────────────
  // parsed.building's shape matches the table columns 1:1; we add fetched_at
  // explicitly so a RE-fetch bumps it (the column default only fires on INSERT).
  const { error: bErr } = await supabase
    .from('hansen_buildings')
    .upsert(
      { ...parsed.building, fetched_at: fetchedAt },
      { onConflict: 'bldg_id' }
    )
  if (bErr) throw new Error(`hansen_buildings upsert failed: ${bErr.message}`)

  // ── hansen_permits ───────────────────────────────────────────────────────
  let permitsCount = 0
  {
    const deduped = dedupeBy(parsed.permits, (p) => p.permit_number)
    if (deduped.length > 0) {
      const rows = deduped.map((p) => ({ ...p, bldg_id: bldgId, fetched_at: fetchedAt }))
      const { error } = await supabase
        .from('hansen_permits')
        .upsert(rows, { onConflict: 'bldg_id,permit_number' })
      if (error) throw new Error(`hansen_permits upsert failed: ${error.message}`)
      permitsCount = rows.length
    }
  }

  // ── hansen_enforcement_cases ─────────────────────────────────────────────
  let casesCount = 0
  {
    const deduped = dedupeBy(parsed.enforcement_cases, (c) => c.case_number)
    if (deduped.length > 0) {
      const rows = deduped.map((c) => ({ ...c, bldg_id: bldgId, fetched_at: fetchedAt }))
      const { error } = await supabase
        .from('hansen_enforcement_cases')
        .upsert(rows, { onConflict: 'bldg_id,case_number' })
      if (error) throw new Error(`hansen_enforcement_cases upsert failed: ${error.message}`)
      casesCount = rows.length
    }
  }

  // ── hansen_inspections ───────────────────────────────────────────────────
  let inspectionsCount = 0
  {
    const deduped = dedupeBy(parsed.inspections, (i) => i.inspection_number)
    if (deduped.length > 0) {
      const rows = deduped.map((i) => ({ ...i, bldg_id: bldgId, fetched_at: fetchedAt }))
      const { error } = await supabase
        .from('hansen_inspections')
        .upsert(rows, { onConflict: 'bldg_id,inspection_number' })
      if (error) throw new Error(`hansen_inspections upsert failed: ${error.message}`)
      inspectionsCount = rows.length
    }
  }

  // ── hansen_violations ────────────────────────────────────────────────────
  // Conflict key is the compound (bldg_id, inspection_number, violation_code).
  let violationsCount = 0
  {
    const deduped = dedupeBy(
      parsed.violations,
      (v) => `${v.inspection_number}::${v.violation_code}`
    )
    if (deduped.length > 0) {
      const rows = deduped.map((v) => ({ ...v, bldg_id: bldgId, fetched_at: fetchedAt }))
      const { error } = await supabase
        .from('hansen_violations')
        .upsert(rows, { onConflict: 'bldg_id,inspection_number,violation_code' })
      if (error) throw new Error(`hansen_violations upsert failed: ${error.message}`)
      violationsCount = rows.length
    }
  }

  // ── hansen_address_ranges ────────────────────────────────────────────────
  // A building can front multiple streets / span multiple ranges. Store the
  // verbatim line plus a best-effort parse into low/high/street. The unique
  // (bldg_id, raw_line) constraint absorbs the city's literal repeated lines.
  let rangesCount = 0
  {
    const deduped = dedupeBy(parsed.range_addresses, (r) => r)
    if (deduped.length > 0) {
      const rows = deduped.map((raw, idx) => {
        const m = raw.match(
          /^(\d+)\s*-\s*(\d+)\s+(.*?)(?:\s+CHICAGO\s+IL\s+\d{5})?\s*$/i
        )
        return {
          bldg_id: bldgId,
          raw_line: raw,
          low_number: m ? parseInt(m[1], 10) : null,
          high_number: m ? parseInt(m[2], 10) : null,
          street: m ? m[3].trim() || null : null,
          position: idx + 1,
          fetched_at: fetchedAt,
        }
      })
      const { error } = await supabase
        .from('hansen_address_ranges')
        .upsert(rows, { onConflict: 'bldg_id,raw_line' })
      if (error) throw new Error(`hansen_address_ranges upsert failed: ${error.message}`)
      rangesCount = rows.length
    }
  }

  // ── hansen_building_addr_ids ─────────────────────────────────────────────
  // The full set of addr= values seen in the inspection links, with their
  // occurrence counts and which one was chosen as primary. Kept as its own
  // rows (not a joined string) so it stays queryable — a future dataset keyed
  // on Hansen addr= ids can join straight against this.
  let addrIdsCount = 0
  {
    const deduped = dedupeBy(parsed.addr_ids, (a) => a.detail_addr_id)
    if (deduped.length > 0) {
      const rows = deduped.map((a) => ({
        bldg_id: bldgId,
        detail_addr_id: a.detail_addr_id,
        occurrences: a.occurrences,
        is_primary: a.is_primary,
        fetched_at: fetchedAt,
      }))
      const { error } = await supabase
        .from('hansen_building_addr_ids')
        .upsert(rows, { onConflict: 'bldg_id,detail_addr_id' })
      if (error) throw new Error(`hansen_building_addr_ids upsert failed: ${error.message}`)
      addrIdsCount = rows.length
    }
  }

  return {
    bldg_id: bldgId,
    persisted: true,
    buildings: 1,
    permits: permitsCount,
    enforcement_cases: casesCount,
    inspections: inspectionsCount,
    violations: violationsCount,
    address_ranges: rangesCount,
    addr_ids: addrIdsCount,
  }
}