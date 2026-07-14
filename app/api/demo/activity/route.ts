import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildActivityFeed } from '@/lib/activity-feed'
import { getDemoPortfolio } from '@/lib/demo-portfolios'
import { getEnabledCodes } from '@/lib/sr-preferences'
import { OWNER_RELEVANT_CODES } from '@/lib/sr-codes'

// Public (no auth) activity feed for a demo portfolio — same query core as
// the dashboard feed (lib/activity-feed.ts), scoped strictly to the demo
// portfolio's synthetic user_id resolved from the slug allowlist in
// lib/demo-portfolios.ts. Unknown slugs 404; there is no way to reach a real
// user's portfolio through this route.

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const demo = getDemoPortfolio(searchParams.get('slug'))
  if (!demo) {
    return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
  }

  const supabase = getSupabaseAdmin()

  // Demo users are seeded with the owner-relevant defaults; fall back to the
  // same set if the prefs rows are ever missing so the feed never goes blank.
  let enabledCodes = await getEnabledCodes(supabase, demo.userId)
  if (enabledCodes.size === 0) enabledCodes = new Set(OWNER_RELEVANT_CODES)

  const result = await buildActivityFeed(supabase, demo.userId, searchParams, enabledCodes)
  return NextResponse.json(result.body, { status: result.status })
}
