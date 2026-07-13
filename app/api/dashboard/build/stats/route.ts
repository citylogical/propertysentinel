// app/api/dashboard/build/stats/route.ts
//
// "Building your portfolio" step 1: compute activity stats for the caller's
// portfolio properties that don't have them yet. Promotion now skips stats
// (they were the slow part — a 300-property save would time out), so freshly
// promoted rows sit with stats_updated_at IS NULL until this fills them in.
//
// Chunked, browser-driven, stateless: progress state IS the null column, so
// resume-after-close is just calling again. Worker C's nightly phase 3 is
// the backstop for tabs that never come back.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'

export const runtime = 'nodejs'
export const maxDuration = 60

const TIME_BUDGET_MS = 25_000
const MAX_PER_CALL = 8

type PendingRow = {
  id: string
  canonical_address: string
  address_range: string | null
  additional_streets: string[] | null
  pins: string[] | null
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: pending, error: pendingErr } = await supabase
    .from('portfolio_properties')
    .select('id, canonical_address, address_range, additional_streets, pins')
    .eq('user_id', userId)
    .is('stats_updated_at', null)
    .order('created_at', { ascending: true })
    .range(0, MAX_PER_CALL - 1)
  if (pendingErr) return NextResponse.json({ error: pendingErr.message }, { status: 500 })

  const rows = (pending ?? []) as PendingRow[]
  const started = Date.now()
  let processed = 0

  for (const row of rows) {
    if (processed > 0 && Date.now() - started > TIME_BUDGET_MS) break
    try {
      const activity = await fetchPortfolioActivity(
        supabase,
        row.canonical_address,
        row.address_range,
        row.additional_streets?.length ? row.additional_streets : null,
        row.pins?.length ? row.pins : null
      )
      await supabase
        .from('portfolio_properties')
        .update({ ...activity.stats, stats_updated_at: new Date().toISOString() })
        .eq('id', row.id)
      processed++
    } catch (e) {
      console.error('[build/stats] failed for', row.canonical_address, e)
      // Stamp anyway so one poisoned property can't wedge the loop; Worker C
      // recomputes nightly.
      await supabase
        .from('portfolio_properties')
        .update({ stats_updated_at: new Date().toISOString() })
        .eq('id', row.id)
      processed++
    }
  }

  const { count: remaining } = await supabase
    .from('portfolio_properties')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('stats_updated_at', null)

  return NextResponse.json({ processed, remaining: remaining ?? 0 })
}
