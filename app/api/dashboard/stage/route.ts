import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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

  const supabase = getSupabaseAdmin()

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

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const canonicalAddress = searchParams.get('canonical_address')
  const id = searchParams.get('id')

  if (!canonicalAddress && !id) {
    return NextResponse.json({ error: 'Missing canonical_address or id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Only queue-state rows are deletable; a row mid-checkout or already
  // promoted is managed by the commit flow, not the address-page toggle.
  let query = supabase.from('staged_properties').delete().eq('clerk_id', userId).eq('status', 'staged')
  if (id) {
    query = query.eq('id', id)
  } else {
    query = query.eq('canonical_address', String(canonicalAddress).toUpperCase().trim())
  }

  const { error } = await query

  if (error) {
    console.error('Unstage property error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
