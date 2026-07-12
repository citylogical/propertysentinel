// app/api/dashboard/import/commit/route.ts
//
// Rent-roll upload, final step: turn the reviewed import into staging-queue
// rows. One staged_properties row per included property (upsert on
// clerk_id,canonical_address — same key the manual add uses) plus real unit
// detail in staged_property_units, which promoteRows() copies into
// portfolio_property_units at promotion instead of synthetic "Unit 1..N".
//
// Idempotent: units are delete-and-reinserted per staged row, properties
// upsert, and a 'committed' job can be re-committed after further review
// edits ("go back to the review from the queue"). Entitlement is still
// decided by the existing stage/commit + checkout flow — this endpoint only
// STAGES; it never writes the portfolio.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import { generateSlug, type ImportResolution } from '@/lib/rentroll/resolve'
import type { ParsedUnitRow } from '@/lib/rentroll/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_UNITS_PER_PROPERTY = 1000

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { job_id?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const jobId = (body.job_id ?? '').trim()
  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, status, parsed_rows, results')
    .eq('id', jobId)
    .eq('clerk_id', userId)
    .maybeSingle()
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const j = job as {
    id: string
    status: string
    parsed_rows: ParsedUnitRow[]
    results: ImportResolution[]
  }
  if (j.status !== 'review' && j.status !== 'committed') {
    return NextResponse.json({ error: 'Job is not ready to commit' }, { status: 409 })
  }

  const resolutionByAddress = new Map<string, ImportResolution>()
  for (const r of Array.isArray(j.results) ? j.results : []) {
    resolutionByAddress.set(r.raw_address, r)
  }

  // Included unit rows only; summary rows and unaddressed rows never stage.
  const rows = (Array.isArray(j.parsed_rows) ? j.parsed_rows : []).filter(
    (r) =>
      r.address &&
      !r.flags.includes('summary_row') &&
      (r.included ?? true)
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nothing selected to add' }, { status: 422 })
  }

  // Group by CANONICAL address — two raw spellings can resolve to the same
  // parcel, and Postgres rejects one upsert statement hitting the same
  // conflict target twice.
  type Group = { resolution: ImportResolution | null; units: ParsedUnitRow[] }
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const resolution = resolutionByAddress.get(row.address!) ?? null
    const canonical = resolution?.canonical_address ?? row.address!
    if (!groups.has(canonical)) groups.set(canonical, { resolution, units: [] })
    groups.get(canonical)!.units.push(row)
  }

  const stagedRows = [...groups.entries()].map(([canonical, g]) => ({
    clerk_id: userId,
    canonical_address: canonical,
    slug: g.resolution?.slug ?? generateSlug(canonical, null),
    property_name: formatAddressForDisplay(canonical),
    units: Math.min(g.units.length, MAX_UNITS_PER_PROPERTY),
    address_range: g.resolution?.address_range ?? null,
    additional_streets: null,
    pins: g.resolution && g.resolution.pins.length > 0 ? g.resolution.pins : null,
    sqft: g.resolution?.sqft ?? null,
    year_built: g.resolution?.year_built ?? null,
    implied_value: g.resolution?.implied_value ?? null,
    community_area: g.resolution?.community_area ?? null,
    property_class: g.resolution?.property_class ?? null,
    status: 'staged',
    checkout_session_id: null,
    promoted_at: null,
    updated_at: new Date().toISOString(),
  }))

  const { data: staged, error: stageErr } = await supabase
    .from('staged_properties')
    .upsert(stagedRows, { onConflict: 'clerk_id,canonical_address' })
    .select('id, canonical_address')
  if (stageErr) {
    return NextResponse.json({ error: `Staging failed: ${stageErr.message}` }, { status: 500 })
  }

  const idByCanonical = new Map<string, string>()
  for (const s of (staged ?? []) as Array<{ id: string; canonical_address: string }>) {
    idByCanonical.set(s.canonical_address, s.id)
  }

  // Real unit detail, replace-on-recommit so edits in review win.
  const stagedIds = [...idByCanonical.values()]
  if (stagedIds.length > 0) {
    const { error: delErr } = await supabase
      .from('staged_property_units')
      .delete()
      .in('staged_property_id', stagedIds)
    if (delErr) {
      return NextResponse.json({ error: `Unit reset failed: ${delErr.message}` }, { status: 500 })
    }
  }

  const unitRows: Array<Record<string, unknown>> = []
  for (const [canonical, g] of groups) {
    const stagedId = idByCanonical.get(canonical)
    if (!stagedId) continue
    g.units.slice(0, MAX_UNITS_PER_PROPERTY).forEach((u, i) => {
      unitRows.push({
        staged_property_id: stagedId,
        unit_label: u.unit_label?.trim() || `Unit ${i + 1}`,
        bd_ba: u.bd_ba,
        status: u.status,
        rent: u.rent,
        lease_from: u.lease_from,
        lease_to: u.lease_to,
        move_in: u.move_in,
        move_out: u.move_out,
        source: 'rent_roll',
      })
    })
  }
  if (unitRows.length > 0) {
    const { error: unitsErr } = await supabase.from('staged_property_units').insert(unitRows)
    if (unitsErr) {
      return NextResponse.json({ error: `Unit insert failed: ${unitsErr.message}` }, { status: 500 })
    }
  }

  await supabase
    .from('import_jobs')
    .update({
      status: 'committed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', j.id)

  return NextResponse.json({
    staged: stagedRows.length,
    units: unitRows.length,
  })
}
