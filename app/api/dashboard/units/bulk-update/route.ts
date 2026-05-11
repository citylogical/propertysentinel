import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED_FIELDS = new Set(['tag', 'status'])

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { unit_ids?: string[]; patch?: Record<string, unknown> }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const unitIds = Array.isArray(body.unit_ids) ? body.unit_ids.filter((id) => typeof id === 'string') : []
  const patch = body.patch ?? {}
  if (unitIds.length === 0) {
    return NextResponse.json({ error: 'Missing unit_ids' }, { status: 400 })
  }
  if (unitIds.length > 500) {
    return NextResponse.json({ error: 'Too many units in one request (max 500)' }, { status: 400 })
  }

  const cleanPatch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED_FIELDS.has(key)) {
      cleanPatch[key] = value === '' ? null : value
    }
  }
  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ error: 'No editable fields in patch (only tag and status allowed for bulk)' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Verify ownership: fetch the portfolio_property_id for every unit, then confirm those properties belong to the user
  const { data: unitRows, error: unitErr } = await supabase
    .from('portfolio_property_units')
    .select('id, portfolio_property_id')
    .in('id', unitIds)

  if (unitErr) {
    console.error('Unit bulk-update lookup error:', unitErr)
    return NextResponse.json({ error: unitErr.message }, { status: 500 })
  }

  if (!unitRows || unitRows.length !== unitIds.length) {
    return NextResponse.json({ error: 'Some units not found' }, { status: 404 })
  }

  const distinctPropIds = [...new Set(unitRows.map((r) => r.portfolio_property_id as string))]
  const { data: propRows, error: propErr } = await supabase
    .from('portfolio_properties')
    .select('id, user_id')
    .in('id', distinctPropIds)

  if (propErr) {
    console.error('Unit bulk-update prop lookup error:', propErr)
    return NextResponse.json({ error: propErr.message }, { status: 500 })
  }

  const allOwned = (propRows ?? []).every((p) => (p as { user_id: string }).user_id === userId)
  if (!allOwned || (propRows ?? []).length !== distinctPropIds.length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: updateErr, count } = await supabase
    .from('portfolio_property_units')
    .update(cleanPatch, { count: 'exact' })
    .in('id', unitIds)

  if (updateErr) {
    console.error('Unit bulk-update error:', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ updated: count ?? unitIds.length })
}
