import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SR_SHORT_PENDING = [
  'BBA',
  'BBC',
  'BBD',
  'BBK',
  'BPI',
  'HDF',
  'SCB',
  'HFB',
  'RBL',
  'CAFE',
  'CORNVEND',
  'SHVR',
] as const

function iso48hAgo() {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
}

function iso24hAgo() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
}

function iso1hAgo() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString()
}

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (user.publicMetadata as { role?: string } | null | undefined)?.role
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()
  const t48 = iso48hAgo()
  const t24 = iso24hAgo()
  const t1 = iso1hAgo()

  const [c24, c1, lastRow, pending] = await Promise.all([
    supabase
      .from('complaints_311')
      .select('id', { count: 'exact', head: true })
      .gte('created_date', t48)
      .gte('enriched_at', t24),
    supabase
      .from('complaints_311')
      .select('id', { count: 'exact', head: true })
      .gte('created_date', t48)
      .gte('enriched_at', t1),
    supabase
      .from('complaints_311')
      .select('enriched_at')
      .gte('created_date', t48)
      .not('enriched_at', 'is', null)
      .order('enriched_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('complaints_311')
      .select('id', { count: 'exact', head: true })
      .gte('created_date', t48)
      .is('enriched_at', null)
      .in('sr_short_code', [...SR_SHORT_PENDING]),
  ])

  if (c24.error) {
    return NextResponse.json({ error: c24.error.message }, { status: 500 })
  }
  if (c1.error) {
    return NextResponse.json({ error: c1.error.message }, { status: 500 })
  }
  if (lastRow.error) {
    return NextResponse.json({ error: lastRow.error.message }, { status: 500 })
  }
  if (pending.error) {
    return NextResponse.json({ error: pending.error.message }, { status: 500 })
  }

  const enriched_24h = c24.count ?? 0
  const enriched_1h = c1.count ?? 0
  const last = lastRow.data as { enriched_at: string } | null
  const last_enriched_at = last?.enriched_at ?? null
  const pending_enrichment = pending.count ?? 0
  const healthy = enriched_24h > 0

  return NextResponse.json({
    enriched_24h,
    enriched_1h,
    last_enriched_at,
    pending_enrichment,
    healthy,
  })
}
