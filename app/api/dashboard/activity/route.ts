import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildActivityFeed } from '@/lib/activity-feed'
import { computeEntitlement } from '@/lib/entitlement'

// The feed query itself lives in lib/activity-feed.ts (shared with the public
// demo route at app/api/demo/activity). This route owns auth + entitlement.

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Entitlement gate: admins always pass; everyone else must be entitled
  // (enterprise, paying, or within their 30-day trial). Lapsed/never-paid
  // users keep their portfolio rows but the activity feed locks.
  {
    const gateSupabase = getSupabaseAdmin()
    const { data: sub } = await gateSupabase
      .from('subscribers')
      .select('role, plan, subscription_status, trial_started_at')
      .eq('clerk_id', userId)
      .maybeSingle()
    const role = (sub as { role?: string | null } | null)?.role ?? ''
    const ent = computeEntitlement(
      sub
        ? {
            plan: (sub as { plan?: string | null }).plan ?? null,
            subscription_status: (sub as { subscription_status?: string | null }).subscription_status ?? null,
            trial_started_at: (sub as { trial_started_at?: string | null }).trial_started_at ?? null,
          }
        : null
    )
    if (role !== 'admin' && !ent.entitled) {
      return NextResponse.json({ error: 'Forbidden', reason: 'not_entitled' }, { status: 403 })
    }
  }

  const { searchParams } = new URL(request.url)
  const supabase = getSupabaseAdmin()
  const result = await buildActivityFeed(supabase, userId, searchParams)
  return NextResponse.json(result.body, { status: result.status })
}
