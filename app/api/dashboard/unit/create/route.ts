import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED_FIELDS = new Set([
  'unit_label',
  'bd_ba',
  'tag',
  'status',
  'rent',
  'lease_from',
  'lease_to',
  'move_in',
  'move_out',
  'ob_date',
])

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { portfolio_property_id?: string; patch?: Record<string, unknown> }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ppId = body.portfolio_property_id
  const patch = body.patch ?? {}
  if (!ppId || typeof ppId !== 'string') {
    return NextResponse.json({ error: 'Missing portfolio_property_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Verify the parent property is owned by the caller
  const { data: prop, error: propErr } = await supabase
    .from('portfolio_properties')
    .select('id, user_id')
    .eq('id', ppId)
    .maybeSingle()

  if (propErr || !prop) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if ((prop as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Build the insertable row from the allowlist
  const insertRow: Record<string, unknown> = {
    portfolio_property_id: ppId,
    source: 'manual',
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_FIELDS.has(key)) continue
    if (typeof value === 'string' && value.trim() === '') {
      insertRow[key] = null
    } else {
      insertRow[key] = value
    }
  }

  const { data: created, error: insertErr } = await supabase
    .from('portfolio_property_units')
    .insert(insertRow)
    .select('id, portfolio_property_id, unit_label, bd_ba, tag, status, rent, lease_from, lease_to, move_in, move_out, ob_date, source, created_at, updated_at')
    .maybeSingle()

  if (insertErr) {
    console.error('Unit create error:', insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ unit: created })
}
