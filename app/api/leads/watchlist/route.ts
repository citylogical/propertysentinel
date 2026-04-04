import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('lead_watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ watchlist: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { leads?: Record<string, unknown>[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const leads = body.leads ?? []
  if (leads.length === 0) return NextResponse.json({ added: 0 })

  const supabase = getSupabaseAdmin()
  const rows = leads.map((l) => ({
    user_id: userId,
    sr_number: String(l.sr_number ?? ''),
    address_normalized: (l.address_normalized as string) ?? null,
    sr_type: (l.sr_type as string) ?? null,
    sr_short_code: (l.sr_short_code as string) ?? null,
    community_area: (l.community_area as string) ?? null,
    created_date: (l.created_date as string) ?? null,
  }))

  const { error } = await supabase.from('lead_watchlist').upsert(rows, { onConflict: 'user_id,sr_number' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ added: rows.length })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { sr_numbers?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sr_numbers = body.sr_numbers ?? []
  if (sr_numbers.length === 0) return NextResponse.json({ removed: 0 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('lead_watchlist').delete().eq('user_id', userId).in('sr_number', sr_numbers)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ removed: sr_numbers.length })
}
