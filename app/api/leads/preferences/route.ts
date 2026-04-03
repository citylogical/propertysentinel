import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

async function requireExploreUser(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data: subscriber } = await supabase.from('subscribers').select('role').eq('clerk_id', userId).single()
  if (!subscriber || !['admin', 'approved'].includes(subscriber.role as string)) {
    return false
  }
  return true
}

/** GET — fetch table preferences */
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!(await requireExploreUser(supabase, userId))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const tableId = req.nextUrl.searchParams.get('table_id') || 'lead_explorer'

  const { data, error } = await supabase
    .from('user_table_preferences')
    .select('*')
    .eq('user_id', userId)
    .eq('table_id', tableId)
    .maybeSingle()

  if (error) {
    console.error('[leads/preferences] GET:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ preferences: data })
}

/** POST — save table preferences */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!(await requireExploreUser(supabase, userId))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: {
    table_id?: string
    column_order?: string[] | null
    column_visibility?: Record<string, boolean> | null
    column_widths?: Record<string, number> | null
    sort_state?: unknown[] | null
    filters?: unknown[] | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const table_id = body.table_id || 'lead_explorer'
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('user_table_preferences')
    .upsert(
      {
        user_id: userId,
        table_id,
        column_order: body.column_order ?? null,
        column_visibility: body.column_visibility ?? null,
        column_widths: body.column_widths ?? null,
        sort_state: body.sort_state ?? null,
        filters: body.filters ?? null,
        updated_at: now,
      },
      { onConflict: 'user_id,table_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('[leads/preferences] POST:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ preferences: data })
}
