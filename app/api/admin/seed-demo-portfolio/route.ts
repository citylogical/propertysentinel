import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { promoteStagedRowsForUser } from '@/lib/staged-promotion'
import { resolveAddressesToProperties } from '@/lib/address-resolution'
import { addressToSlug } from '@/lib/formatAddress'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { getDemoPortfolio } from '@/lib/demo-portfolios'

// Browser-clickable alternative to scripts/seed-troy-demo-portfolio.ts for
// when there's no local env to run tsx from. Same pipeline: stage the seed
// list → promoteStagedRowsForUser (the normal upload path, skipStats for
// speed) → compute per-property activity stats inside a time budget.
//
// Stats for ~50 properties take longer than one invocation allows, so the
// route is RESUMABLE: each call finishes as many stats as fit in the budget
// and reports how many remain. Hit it repeatedly until { done: true } —
// re-runs are idempotent (upsert on user_id,canonical_address; stats loop
// only touches rows with stats_updated_at IS NULL).
//
// GET is supported so an admin can literally visit the URL in a browser:
//   /api/admin/seed-demo-portfolio?slug=troy-realty
// and refresh until done. Safe despite being a GET: admin-only, idempotent,
// and it only ever writes the slug-allowlisted demo user's rows.

export const runtime = 'nodejs'
export const maxDuration = 60

// Leave headroom under maxDuration for staging/promotion and the response.
const STATS_TIME_BUDGET_MS = 40_000

async function seedDemoPortfolio(slugParam: string | null, dryRun: boolean) {
  const demo = getDemoPortfolio(slugParam ?? 'troy-realty')
  if (!demo || demo.seedProperties.length === 0) {
    return NextResponse.json({ error: 'Unknown demo slug' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Resolve PINs for canonical + alias forms in one batched round-trip —
  // same lookup the save flow uses.
  const lookupAddresses = demo.seedProperties.flatMap((p) => [p.canonical, ...(p.aliases ?? [])])
  const resolved = await resolveAddressesToProperties(lookupAddresses)

  const stagedRows = demo.seedProperties.map((p) => {
    const pins = new Set<string>()
    for (const addr of [p.canonical, ...(p.aliases ?? [])]) {
      for (const match of resolved.get(addr) ?? []) {
        if (match.pin) pins.add(match.pin)
      }
    }
    return {
      clerk_id: demo.userId,
      canonical_address: p.canonical,
      slug: addressToSlug(p.canonical),
      property_name: null,
      units: null, // unit mix unknown for the demo — no unit rows materialized
      address_range: null,
      additional_streets: p.aliases?.length ? p.aliases : null,
      pins: pins.size > 0 ? Array.from(pins) : null,
      sqft: null,
      year_built: null,
      implied_value: null,
      community_area: null,
      property_class: null,
      status: 'staged',
      updated_at: new Date().toISOString(),
    }
  })

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      demo_user: demo.userId,
      properties: stagedRows.map((r) => ({
        canonical_address: r.canonical_address,
        pins: r.pins?.length ?? 0,
        aliases: r.additional_streets,
      })),
    })
  }

  const { data: staged, error: stageErr } = await supabase
    .from('staged_properties')
    .upsert(stagedRows, { onConflict: 'clerk_id,canonical_address' })
    .select('id')

  if (stageErr || !staged) {
    return NextResponse.json(
      { error: `staged_properties upsert failed: ${stageErr?.message}` },
      { status: 500 }
    )
  }

  // Promote instantly (skipStats); the stats loop below backfills within the
  // time budget across one or more invocations.
  const promotion = await promoteStagedRowsForUser(
    supabase,
    demo.userId,
    staged.map((s) => s.id as string),
    { skipStats: true }
  )

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
    demo_user: demo.userId,
    staged: staged.length,
    promoted: promotion.promoted,
    promotion_errors: promotion.errors,
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

  let body: { slug?: string; dryRun?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  return seedDemoPortfolio(body.slug ?? null, body.dryRun === true)
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  return seedDemoPortfolio(searchParams.get('slug'), searchParams.get('dry_run') === '1')
}
