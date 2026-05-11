import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { unit_id?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const unitId = body.unit_id
  if (!unitId || typeof unitId !== 'string') {
    return NextResponse.json({ error: 'Missing unit_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Verify ownership chain: unit → portfolio_property → user
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

  const { error: deleteErr } = await supabase.from('portfolio_property_units').delete().eq('id', unitId)

  if (deleteErr) {
    console.error('Unit delete error:', deleteErr)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true, unit_id: unitId })
}
