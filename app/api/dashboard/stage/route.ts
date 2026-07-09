import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { computeEntitlement } from '@/lib/entitlement'
import { resolvePlanKind } from '@/lib/plan'

// Staging queue for the onboarding/activation flow. The address-page "Add"
// button POSTs a one-click snapshot here; rows sit in staged_properties until
// the dashboard queue modal commits them to the portfolio (via Stripe Checkout
// for new subscribers, directly for already-entitled accounts).
//
// Deliberately does NOT stamp trial_started_at, touch lifetime_saves, or gate
// on any cap — staging is free and unlimited. Entitlement is decided at
// commit time, not add time.

function parseOptInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseOptNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseOptString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t !== '' ? t : null
}

function parseStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim())
    : []
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ staged: false, staged_count: 0 })
  }

  const { searchParams } = new URL(request.url)
  const canonicalAddress = searchParams.get('canonical_address')
  const wantList = searchParams.get('list') === '1'

  const supabase = getSupabaseAdmin()

  // Queue contents for the review modal. Queues are user-scale (not 13M-row
  // scale), so a plain select is fine here.
  if (wantList) {
    const { data: rows, error } = await supabase
      .from('staged_properties')
      .select(
        'id, canonical_address, slug, property_name, units, address_range, additional_streets, pins, sqft, year_built, implied_value, community_area, property_class, status, created_at'
      )
      .eq('clerk_id', userId)
      .in('status', ['staged', 'pending_checkout'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Stage list error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Plan context so the queue footer can speak to the user's actual plan:
    // existing subscribers see remaining band capacity instead of a plan
    // recommendation; enterprise/admin see no pricing at all.
    const { data: sub } = await supabase
      .from('subscribers')
      .select('role, plan, subscription_status, trial_started_at, plan_unit_cap')
      .eq('clerk_id', userId)
      .maybeSingle()
    const ent = computeEntitlement(
      sub
        ? {
            plan: (sub as { plan?: string | null }).plan ?? null,
            subscription_status:
              (sub as { subscription_status?: string | null }).subscription_status ?? null,
            trial_started_at:
              (sub as { trial_started_at?: string | null }).trial_started_at ?? null,
          }
        : null
    )
    const kind = resolvePlanKind((sub as { role?: string | null } | null)?.role, ent.reason)

    let portfolioUnits = 0
    const { data: props } = await supabase
      .from('portfolio_properties')
      .select('id')
      .eq('user_id', userId)
    if (props && props.length > 0) {
      const { count: unitCount } = await supabase
        .from('portfolio_property_units')
        .select('*', { count: 'exact', head: true })
        .in('portfolio_property_id', props.map((p) => p.id as string))
      portfolioUnits = unitCount ?? 0
    }

    return NextResponse.json({
      rows: rows ?? [],
      staged_count: rows?.length ?? 0,
      plan: {
        kind,
        unit_cap: (sub as { plan_unit_cap?: number | null } | null)?.plan_unit_cap ?? null,
        portfolio_units: portfolioUnits,
      },
    })
  }

  const { count } = await supabase
    .from('staged_properties')
    .select('id', { count: 'exact', head: true })
    .eq('clerk_id', userId)
    .in('status', ['staged', 'pending_checkout'])

  if (!canonicalAddress) {
    return NextResponse.json({ staged: false, staged_count: count ?? 0 })
  }

  const { data: row } = await supabase
    .from('staged_properties')
    .select('id, status')
    .eq('clerk_id', userId)
    .eq('canonical_address', canonicalAddress.toUpperCase().trim())
    .in('status', ['staged', 'pending_checkout'])
    .maybeSingle()

  return NextResponse.json({
    staged: !!row,
    id: row?.id ?? null,
    staged_count: count ?? 0,
  })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const canonical_address =
    typeof body.canonical_address === 'string' ? body.canonical_address.trim().toUpperCase() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''

  if (!canonical_address || !slug) {
    return NextResponse.json(
      { error: 'Missing required fields: canonical_address and slug' },
      { status: 400 }
    )
  }

  const additional_streets = parseStringArray(body.additional_streets)
  const pins = parseStringArray(body.pins)

  const supabase = getSupabaseAdmin()

  // Re-adding an address that already sits in the queue is an idempotent
  // refresh of the snapshot — the unique (clerk_id, canonical_address)
  // constraint plus upsert keeps double-clicks harmless. A previously
  // promoted row is superseded the same way (the user re-staged it).
  const { data: row, error } = await supabase
    .from('staged_properties')
    .upsert(
      {
        clerk_id: userId,
        canonical_address,
        slug,
        property_name: parseOptString(body.property_name),
        units: parseOptInt(body.units),
        address_range: parseOptString(body.address_range),
        additional_streets: additional_streets.length > 0 ? additional_streets : null,
        pins: pins.length > 0 ? pins : null,
        sqft: parseOptInt(body.sqft),
        year_built: parseOptString(body.year_built),
        implied_value: parseOptNum(body.implied_value),
        community_area: parseOptString(body.community_area),
        property_class: parseOptString(body.property_class),
        status: 'staged',
        checkout_session_id: null,
        promoted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_id,canonical_address' }
    )
    .select('id')
    .single()

  if (error) {
    console.error('Stage property error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: row?.id })
}

// Inline edits from the queue modal: units and property_name only. Everything
// else in the row is a snapshot owned by the add flow.
export async function PATCH(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('units' in body) updates.units = parseOptInt(body.units)
  if ('property_name' in body) updates.property_name = parseOptString(body.property_name)

  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('staged_properties')
    .update(updates)
    .eq('clerk_id', userId)
    .eq('id', id)
    .in('status', ['staged', 'pending_checkout'])

  if (error) {
    console.error('Stage update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const canonicalAddress = searchParams.get('canonical_address')
  const id = searchParams.get('id')
  const all = searchParams.get('all') === '1'

  if (!canonicalAddress && !id && !all) {
    return NextResponse.json({ error: 'Missing canonical_address, id, or all' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Queue-state rows are deletable, including pending_checkout (an abandoned
  // checkout leaves rows there; deleting one simply means the webhook finds
  // nothing to promote for it). Promoted rows are history — not deletable.
  let query = supabase
    .from('staged_properties')
    .delete()
    .eq('clerk_id', userId)
    .in('status', ['staged', 'pending_checkout'])
  if (id) {
    query = query.eq('id', id)
  } else if (canonicalAddress) {
    query = query.eq('canonical_address', canonicalAddress.toUpperCase().trim())
  }
  // all=1: no further filter — wipe the user's whole queue.

  const { error } = await query

  if (error) {
    console.error('Unstage property error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
