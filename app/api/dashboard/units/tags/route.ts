import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch portfolio property IDs for this user, then unit (tag, status) values for those properties.
  // Two queries because portfolio_property_units doesn't have a denormalized user_id.
  const { data: propRows, error: propErr } = await supabase
    .from('portfolio_properties')
    .select('id')
    .eq('user_id', userId)

  if (propErr) {
    console.error('Portfolio tags prop lookup error:', propErr)
    return NextResponse.json({ error: propErr.message }, { status: 500 })
  }

  const propIds = (propRows ?? []).map((r) => r.id as string)
  if (propIds.length === 0) {
    return NextResponse.json({ tags: [], statuses: [] })
  }

  const { data: unitRows, error: unitErr } = await supabase
    .from('portfolio_property_units')
    .select('tag, status')
    .in('portfolio_property_id', propIds)

  if (unitErr) {
    console.error('Portfolio tags unit lookup error:', unitErr)
    return NextResponse.json({ error: unitErr.message }, { status: 500 })
  }

  const tagCounts = new Map<string, number>()
  const statusCounts = new Map<string, number>()

  for (const row of (unitRows ?? []) as { tag: string | null; status: string | null }[]) {
    if (row.tag) tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1)
    if (row.status) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1)
  }

  const tags = [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const statuses = [...statusCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return NextResponse.json({ tags, statuses })
}
