import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { promoteStagedRowsForUser } from '@/lib/staged-promotion'
import { resolveAddressesToProperties } from '@/lib/address-resolution'
import { addressToSlug } from '@/lib/formatAddress'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import {
  getDemoPortfolio,
  type DemoPortfolioConfig,
  type DemoSeedProperty,
} from '@/lib/demo-portfolios'
import { resolveImportAddress, type ImportResolution } from '@/lib/rentroll/resolve'

// Browser-clickable alternative to scripts/seed-troy-demo-portfolio.ts for
// when there's no local env to run tsx from. Same pipeline the UI uses:
// stage the seed list → promoteStagedRowsForUser → per-property activity stats.
//
// Seed entries come in two flavors (lib/demo-portfolios.ts):
//   • canonical — pre-resolved address strings (Troy style); PINs come from one
//     batched resolveAddressesToProperties lookup.
//   • raw — straight off a customer rent roll; resolved server-side through
//     resolveImportAddress (~2.5s each), because hand-written canonicals for
//     suffix-less/misspelled addresses would silently zero their activity.
//
// A full seed is far bigger than one invocation allows (resolution alone is
// minutes), so the route is a resumable PHASE MACHINE — each call runs at most
// one time-budgeted heavy phase and reports progress. Hit the URL repeatedly
// until { done: true }:
//   1. resolve  — chunk through resolveImportAddress; progress persists in an
//                 import_jobs row (clerk_id = demo user, file_name =
//                 'demo-seed:<slug>'), mirroring /api/dashboard/import/process.
//   2. stage    — once, when the queue drains: build staged_properties rows
//                 from the resolutions (+ any pre-resolved entries) and upsert.
//   3. promote  — budgeted slices through promoteStagedRowsForUser (also
//                 materializes portfolio_property_units when units are known).
//   4. stats    — fetchPortfolioActivity per property until none remain.
//
// GET is supported so an admin can literally visit the URL in a browser:
//   /api/admin/seed-demo-portfolio?slug=chicago-style
// and refresh until done. Safe despite being a GET: admin-only, idempotent,
// and it only ever writes the slug-allowlisted demo user's rows.
// Extras: &dry_run=1 previews without writing; &reset=1 clears the resolution
// job + the demo user's staged rows so a config edit can be re-seeded.

export const runtime = 'nodejs'
export const maxDuration = 60

// Leave headroom under maxDuration for the dispatch reads and the response.
const RESOLVE_TIME_BUDGET_MS = 35_000
const MAX_RESOLVE_PER_CALL = 12
const PROMOTE_TIME_BUDGET_MS = 40_000
const PROMOTE_SLICE = 5
const STATS_TIME_BUDGET_MS = 40_000

type StagedInsertRow = {
  clerk_id: string
  canonical_address: string
  slug: string
  property_name: string | null
  units: number | null
  address_range: string | null
  additional_streets: string[] | null
  pins: string[] | null
  sqft: number | null
  year_built: string | null
  implied_value: number | null
  community_area: string | null
  property_class: string | null
  status: string
  updated_at: string
}

type SeedJob = {
  id: string
  resolve_queue: string[]
  results: ImportResolution[]
  total_count: number
  status: string
}

const demoJobMarker = (slug: string) => `demo-seed:${slug}`

function validateSeedConfig(demo: DemoPortfolioConfig): string[] {
  const problems: string[] = []
  demo.seedProperties.forEach((p, i) => {
    const label = p.canonical ?? p.raw ?? `#${i}`
    if (!!p.canonical === !!p.raw) {
      problems.push(`${label}: exactly one of canonical | raw is required`)
    }
    if (demo.cta === 'claim_portfolio' && !(typeof p.units === 'number' && p.units >= 1)) {
      problems.push(`${label}: units >= 1 required on every entry of a claimable portfolio`)
    }
  })
  return problems
}

async function loadSeedJob(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  demo: DemoPortfolioConfig
): Promise<SeedJob | null> {
  const { data } = await supabase
    .from('import_jobs')
    .select('id, resolve_queue, results, total_count, status')
    .eq('clerk_id', demo.userId)
    .eq('file_name', demoJobMarker(demo.slug))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as SeedJob | null) ?? null
}

/** Build the staged_properties rows for every seed entry. Raw entries take
 *  their snapshot from the resolution results; canonical entries from the
 *  batched properties lookup. Entries that resolved to the same canonical
 *  (e.g. a range low-address colliding with a neighbor) are merged — units
 *  summed, pins/streets unioned — and reported so the admin can eyeball them. */
async function buildStagedRows(
  demo: DemoPortfolioConfig,
  results: ImportResolution[]
): Promise<{ rows: StagedInsertRow[]; collisions: string[]; missing: string[] }> {
  const now = new Date().toISOString()
  const byRaw = new Map(results.map((r) => [r.raw_address, r]))
  const byCanonical = new Map<string, StagedInsertRow>()
  const collisions: string[] = []
  const missing: string[] = []

  const addRow = (row: StagedInsertRow) => {
    const existing = byCanonical.get(row.canonical_address)
    if (!existing) {
      byCanonical.set(row.canonical_address, row)
      return
    }
    collisions.push(row.canonical_address)
    if (row.units || existing.units) {
      existing.units = (existing.units ?? 0) + (row.units ?? 0)
    }
    const streets = new Set([
      ...(existing.additional_streets ?? []),
      ...(row.additional_streets ?? []),
    ])
    existing.additional_streets = streets.size > 0 ? Array.from(streets) : null
    const pins = new Set([...(existing.pins ?? []), ...(row.pins ?? [])])
    existing.pins = pins.size > 0 ? Array.from(pins) : null
  }

  const rawEntries = demo.seedProperties.filter((p) => p.raw)
  for (const p of rawEntries) {
    const r = byRaw.get(p.raw as string)
    if (!r) {
      missing.push(p.raw as string)
      continue
    }
    const canonical = r.canonical_address.trim().toUpperCase()
    const streets = new Set<string>(p.aliases ?? [])
    for (const sibling of r.sibling_addresses) {
      if (sibling !== canonical) streets.add(sibling)
    }
    addRow({
      clerk_id: demo.userId,
      canonical_address: canonical,
      // addressToSlug, not resolve.ts's generateSlug — the latter bakes in a
      // "-Chicago-" segment that no other portfolio slug carries.
      slug: addressToSlug(canonical),
      property_name: null,
      units: p.units ?? null,
      address_range: r.address_range,
      additional_streets: streets.size > 0 ? Array.from(streets) : null,
      pins: r.pins.length > 0 ? r.pins : null,
      sqft: r.sqft,
      year_built: r.year_built,
      implied_value: r.implied_value,
      community_area: r.community_area,
      property_class: r.property_class,
      status: 'staged',
      updated_at: now,
    })
  }

  const canonicalEntries = demo.seedProperties.filter(
    (p): p is DemoSeedProperty & { canonical: string } => !!p.canonical
  )
  if (canonicalEntries.length > 0) {
    // Resolve PINs for canonical + alias forms in one batched round-trip —
    // same lookup the save flow uses.
    const lookupAddresses = canonicalEntries.flatMap((p) => [p.canonical, ...(p.aliases ?? [])])
    const resolved = await resolveAddressesToProperties(lookupAddresses)
    for (const p of canonicalEntries) {
      const pins = new Set<string>()
      for (const addr of [p.canonical, ...(p.aliases ?? [])]) {
        for (const match of resolved.get(addr) ?? []) {
          if (match.pin) pins.add(match.pin)
        }
      }
      addRow({
        clerk_id: demo.userId,
        canonical_address: p.canonical,
        slug: addressToSlug(p.canonical),
        property_name: null,
        units: p.units ?? null,
        address_range: null,
        additional_streets: p.aliases?.length ? p.aliases : null,
        pins: pins.size > 0 ? Array.from(pins) : null,
        sqft: null,
        year_built: null,
        implied_value: null,
        community_area: null,
        property_class: null,
        status: 'staged',
        updated_at: now,
      })
    }
  }

  return { rows: Array.from(byCanonical.values()), collisions, missing }
}

async function seedDemoPortfolio(slugParam: string | null, dryRun: boolean, reset: boolean) {
  const demo = getDemoPortfolio(slugParam ?? 'troy-realty')
  if (!demo || demo.seedProperties.length === 0) {
    return NextResponse.json({ error: 'Unknown demo slug' }, { status: 400 })
  }

  const configProblems = validateSeedConfig(demo)
  if (configProblems.length > 0) {
    return NextResponse.json({ error: 'Invalid seed config', problems: configProblems }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const rawEntries = demo.seedProperties.filter((p) => p.raw)
  const needsResolution = rawEntries.length > 0

  if (reset) {
    await supabase
      .from('import_jobs')
      .delete()
      .eq('clerk_id', demo.userId)
      .eq('file_name', demoJobMarker(demo.slug))
    await supabase.from('staged_properties').delete().eq('clerk_id', demo.userId)
    return NextResponse.json({
      reset: true,
      demo_user: demo.userId,
      hint:
        'Resolution job and staged rows cleared (portfolio_properties untouched). ' +
        'Hit the endpoint again to re-seed.',
    })
  }

  const job = needsResolution ? await loadSeedJob(supabase, demo) : null

  if (dryRun) {
    const { count: stagedCount } = await supabase
      .from('staged_properties')
      .select('id', { count: 'exact', head: true })
      .eq('clerk_id', demo.userId)
    const { count: portfolioCount } = await supabase
      .from('portfolio_properties')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', demo.userId)
    return NextResponse.json({
      dry_run: true,
      demo_user: demo.userId,
      entries: demo.seedProperties.length,
      raw_entries: rawEntries.length,
      pre_resolved_entries: demo.seedProperties.length - rawEntries.length,
      total_units: demo.seedProperties.reduce((sum, p) => sum + (p.units ?? 0), 0),
      resolution_job: job ? { status: job.status, remaining: job.resolve_queue.length } : null,
      staged_rows: stagedCount ?? 0,
      portfolio_rows: portfolioCount ?? 0,
    })
  }

  // ── Phase 1: resolve (raw entries only) ──────────────────────────────────
  if (needsResolution) {
    let activeJob = job
    if (!activeJob) {
      const { data: created, error: createErr } = await supabase
        .from('import_jobs')
        .insert({
          clerk_id: demo.userId,
          file_name: demoJobMarker(demo.slug),
          resolve_queue: rawEntries.map((p) => p.raw),
          results: [],
          total_count: rawEntries.length,
          status: 'pending',
        })
        .select('id, resolve_queue, results, total_count, status')
        .single()
      if (createErr || !created) {
        return NextResponse.json(
          { error: `import_jobs insert failed: ${createErr?.message}` },
          { status: 500 }
        )
      }
      activeJob = created as SeedJob
    }

    if (activeJob.status === 'pending' || activeJob.status === 'resolving') {
      const queue = Array.isArray(activeJob.resolve_queue) ? activeJob.resolve_queue : []
      const newResults: ImportResolution[] = []
      const started = Date.now()
      for (const address of queue) {
        if (newResults.length >= MAX_RESOLVE_PER_CALL) break
        if (newResults.length > 0 && Date.now() - started > RESOLVE_TIME_BUDGET_MS) break
        newResults.push(await resolveImportAddress(address))
      }
      const remaining = queue.slice(newResults.length)
      const { error: updateErr } = await supabase
        .from('import_jobs')
        .update({
          resolve_queue: remaining,
          results: [...(Array.isArray(activeJob.results) ? activeJob.results : []), ...newResults],
          processed_count: activeJob.total_count - remaining.length,
          status: remaining.length === 0 ? 'review' : 'resolving',
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeJob.id)
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }
      if (remaining.length > 0) {
        return NextResponse.json({
          phase: 'resolving',
          demo_user: demo.userId,
          resolved_this_call: newResults.length,
          resolve_remaining: remaining.length,
          no_match_this_call: newResults
            .filter((r) => r.match === 'no_match')
            .map((r) => r.raw_address),
          done: false,
          hint: 'Hit this endpoint again to continue resolving addresses.',
        })
      }
      activeJob = { ...activeJob, resolve_queue: [], status: 'review' }
      activeJob.results = [...activeJob.results, ...newResults]
    }

    // ── Phase 2: stage (once, when resolution completes) ───────────────────
    if (activeJob.status === 'review') {
      const { rows, collisions, missing } = await buildStagedRows(demo, activeJob.results)
      const { data: staged, error: stageErr } = await supabase
        .from('staged_properties')
        .upsert(rows, { onConflict: 'clerk_id,canonical_address' })
        .select('id')
      if (stageErr || !staged) {
        return NextResponse.json(
          { error: `staged_properties upsert failed: ${stageErr?.message}` },
          { status: 500 }
        )
      }
      await supabase
        .from('import_jobs')
        .update({
          status: 'committed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeJob.id)
      const noMatch = activeJob.results.filter((r) => r.match === 'no_match')
      return NextResponse.json({
        phase: 'staged',
        demo_user: demo.userId,
        staged: staged.length,
        collisions,
        unresolved_entries: missing,
        no_match: noMatch.map((r) => r.raw_address),
        done: false,
        hint: 'Hit this endpoint again to promote the staged rows.',
      })
    }
  } else {
    // Pre-resolved configs (Troy): stage once, only when nothing is staged yet.
    // Re-staging on every call would reset promoted rows back to 'staged' and
    // force full re-promotion — use ?reset=1 to refresh a live seed instead.
    const { count: existingStaged } = await supabase
      .from('staged_properties')
      .select('id', { count: 'exact', head: true })
      .eq('clerk_id', demo.userId)
    if ((existingStaged ?? 0) === 0) {
      const { rows, collisions, missing } = await buildStagedRows(demo, [])
      const { data: staged, error: stageErr } = await supabase
        .from('staged_properties')
        .upsert(rows, { onConflict: 'clerk_id,canonical_address' })
        .select('id')
      if (stageErr || !staged) {
        return NextResponse.json(
          { error: `staged_properties upsert failed: ${stageErr?.message}` },
          { status: 500 }
        )
      }
      return NextResponse.json({
        phase: 'staged',
        demo_user: demo.userId,
        staged: staged.length,
        collisions,
        unresolved_entries: missing,
        done: false,
        hint: 'Hit this endpoint again to promote the staged rows.',
      })
    }
  }

  // ── Phase 3: promote (budgeted slices; promoteStagedRowsForUser marks rows
  // 'promoted' as it goes, so this resumes cleanly) ─────────────────────────
  const { data: toPromote } = await supabase
    .from('staged_properties')
    .select('id')
    .eq('clerk_id', demo.userId)
    .eq('status', 'staged')
    .order('canonical_address')
  const promoteIds = ((toPromote ?? []) as { id: string }[]).map((r) => r.id)

  if (promoteIds.length > 0) {
    const deadline = Date.now() + PROMOTE_TIME_BUDGET_MS
    let promoted = 0
    const promotionErrors: string[] = []
    for (let i = 0; i < promoteIds.length; i += PROMOTE_SLICE) {
      if (i > 0 && Date.now() > deadline) break
      const slice = promoteIds.slice(i, i + PROMOTE_SLICE)
      const result = await promoteStagedRowsForUser(supabase, demo.userId, slice, {
        skipStats: true,
      })
      promoted += result.promoted
      promotionErrors.push(...result.errors)
    }
    const remaining = promoteIds.length - promoted - promotionErrors.length
    return NextResponse.json({
      phase: 'promoting',
      demo_user: demo.userId,
      promoted_this_call: promoted,
      promotion_errors: promotionErrors,
      promote_remaining: Math.max(0, remaining),
      done: false,
      hint:
        remaining > 0
          ? 'Hit this endpoint again to continue promoting.'
          : 'Hit this endpoint again to compute activity stats.',
    })
  }

  // ── Phase 4: stats ────────────────────────────────────────────────────────
  const { data: needStats } = await supabase
    .from('portfolio_properties')
    .select('id, canonical_address, address_range, additional_streets, pins')
    .eq('user_id', demo.userId)
    .is('stats_updated_at', null)
    .order('canonical_address')

  const pending = (needStats ?? []) as {
    id: string
    canonical_address: string
    address_range: string | null
    additional_streets: string[] | null
    pins: string[] | null
  }[]

  const deadline = Date.now() + STATS_TIME_BUDGET_MS
  let statsDone = 0
  const statsErrors: string[] = []

  for (const row of pending) {
    if (Date.now() > deadline) break
    try {
      const activity = await fetchPortfolioActivity(
        supabase,
        row.canonical_address,
        row.address_range,
        row.additional_streets,
        row.pins
      )
      await supabase
        .from('portfolio_properties')
        .update({ ...activity.stats, stats_updated_at: new Date().toISOString() })
        .eq('id', row.id)
      statsDone++
    } catch (err) {
      console.error('Demo seed stats failed:', row.canonical_address, err)
      statsErrors.push(row.canonical_address)
    }
  }

  const statsRemaining = pending.length - statsDone - statsErrors.length

  return NextResponse.json({
    phase: 'stats',
    demo_user: demo.userId,
    stats_done_this_call: statsDone,
    stats_errors: statsErrors,
    stats_remaining: statsRemaining,
    done: statsRemaining === 0 && statsErrors.length === 0,
    hint:
      statsRemaining > 0
        ? 'Hit this endpoint again to continue computing stats.'
        : 'Seed complete — visit /demo/' + demo.slug,
  })
}

async function requireAdmin(): Promise<NextResponse | null> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Localhost bypass — matches other admin routes
  if (process.env.NODE_ENV !== 'development') {
    const supabase = getSupabaseAdmin()
    const { data: caller } = await supabase
      .from('subscribers')
      .select('role, is_admin')
      .eq('clerk_id', userId)
      .maybeSingle()
    if (caller?.role !== 'admin' && !caller?.is_admin) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }
  }
  return null
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { slug?: string; dryRun?: boolean; reset?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  return seedDemoPortfolio(body.slug ?? null, body.dryRun === true, body.reset === true)
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  return seedDemoPortfolio(
    searchParams.get('slug'),
    searchParams.get('dry_run') === '1',
    searchParams.get('reset') === '1'
  )
}
