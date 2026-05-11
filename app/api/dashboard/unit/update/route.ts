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

  let body: { unit_id?: string; patch?: Record<string, unknown> }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const unitId = body.unit_id
  const patch = body.patch ?? {}
  if (!unitId || typeof unitId !== 'string') {
    return NextResponse.json({ error: 'Missing unit_id' }, { status: 400 })
  }

  const cleanPatch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED_FIELDS.has(key)) {
      cleanPatch[key] = value === '' ? null : value
    }
  }
  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ error: 'No editable fields in patch' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Verify ownership: unit -> portfolio_property -> user
  const { data: unit, error: unitErr } = await supabase
    .from('portfolio_property_units')
    .select('id, portfolio_property_id, portfolio_properties!inner(user_id)')
    .eq('id', unitId)
    .maybeSingle()

  if (unitErr || !unit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ownerId = (unit as unknown as { portfolio_properties: { user_id: string } }).portfolio_properties.user_id
  if (ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('portfolio_property_units')
    .update(cleanPatch)
    .eq('id', unitId)
    .select('id, portfolio_property_id, unit_label, bd_ba, tag, status, rent, lease_from, lease_to, move_in, move_out, ob_date, source, created_at, updated_at')
    .maybeSingle()

  if (updateErr) {
    console.error('Unit update error:', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ unit: updated })
}
