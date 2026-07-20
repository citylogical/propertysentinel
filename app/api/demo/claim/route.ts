import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getDemoPortfolio } from '@/lib/demo-portfolios'

// "Claim portfolio" — copies a demo portfolio's properties into the SIGNED-IN
// visitor's staging queue, so the normal activation path takes over from
// there: the client immediately POSTs /api/dashboard/stage/commit with the
// returned ids (entitled accounts promote straight to the dashboard, everyone
// else gets requires_checkout → plan step → Stripe embedded checkout →
// webhook promotion).
//
// The source of truth is the DEMO USER's portfolio_properties rows — not the
// seed config — because those carry the server-resolved canonicals, PINs, and
// parcel characteristics the seed pipeline derived. Rows are upserted on
// (clerk_id, canonical_address), so double-claiming is an idempotent snapshot
// refresh and never duplicates the visitor's queue.

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { slug?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const demo = getDemoPortfolio(body.slug ?? null)
  if (!demo) {
    return NextResponse.json({ error: 'Unknown demo slug' }, { status: 404 })
  }
  if (demo.cta !== 'claim_portfolio') {
    return NextResponse.json({ error: 'This demo is not claimable' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  type DemoPropertyRow = {
    canonical_address: string
    slug: string | null
    display_name: string | null
    units_override: number | null
    address_range: string | null
    additional_streets: string[] | null
    pins: string[] | null
    sqft_override: number | null
    year_built: number | string | null
    implied_value: number | null
    community_area: string | null
    property_class: string | null
  }

  const { data, error: readErr } = await supabase
    .from('portfolio_properties')
    .select(
      'canonical_address, slug, display_name, units_override, address_range, ' +
        'additional_streets, pins, sqft_override, year_built, implied_value, ' +
        'community_area, property_class'
    )
    .eq('user_id', demo.userId)
    .order('canonical_address')

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }
  // Double cast: supabase-js can't parse the concatenated select string into
  // a row type, so it infers an error shape.
  const demoRows = (data ?? []) as unknown as DemoPropertyRow[]
  if (demoRows.length === 0) {
    return NextResponse.json({ error: 'Demo portfolio is not seeded yet' }, { status: 409 })
  }

  // Skip properties the visitor already owns — re-claiming after a completed
  // checkout would otherwise flip their promoted staged rows back to 'staged'
  // and, if the follow-up commit request failed, strand owned properties in
  // the queue as seemingly pending checkout.
  const { data: ownedRows } = await supabase
    .from('portfolio_properties')
    .select('canonical_address')
    .eq('user_id', userId)
    .in(
      'canonical_address',
      demoRows.map((p) => p.canonical_address.trim().toUpperCase())
    )
  const owned = new Set(
    ((ownedRows ?? []) as { canonical_address: string }[]).map((r) => r.canonical_address)
  )
  const toStage = demoRows.filter((p) => !owned.has(p.canonical_address.trim().toUpperCase()))
  if (toStage.length === 0) {
    return NextResponse.json({ already_claimed: true, staged_ids: [], total_units: 0 })
  }

  const now = new Date().toISOString()
  const stagedRows = toStage.map((p) => ({
    clerk_id: userId,
    canonical_address: p.canonical_address.trim().toUpperCase(),
    slug: p.slug ?? '',
    property_name: p.display_name,
    // Commit validation requires units >= 1 on every row; claimable demo
    // seeds always carry unit counts, so the fallback should never fire.
    units: p.units_override ?? 1,
    address_range: p.address_range,
    additional_streets: p.additional_streets,
    pins: p.pins,
    sqft: p.sqft_override,
    year_built: p.year_built == null ? null : String(p.year_built),
    implied_value: p.implied_value,
    community_area: p.community_area,
    property_class: p.property_class,
    status: 'staged',
    checkout_session_id: null,
    promoted_at: null,
    updated_at: now,
  }))

  const { data: staged, error: stageErr } = await supabase
    .from('staged_properties')
    .upsert(stagedRows, { onConflict: 'clerk_id,canonical_address' })
    .select('id, units')

  if (stageErr || !staged) {
    console.error('Claim portfolio stage error:', stageErr)
    return NextResponse.json(
      { error: stageErr?.message ?? 'Could not stage the portfolio' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    staged_ids: staged.map((r) => r.id as string),
    total_units: staged.reduce((sum, r) => sum + ((r.units as number | null) ?? 0), 0),
  })
}
