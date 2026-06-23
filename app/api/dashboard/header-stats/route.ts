import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { computeEntitlement } from '@/lib/entitlement'

// Minimal aggregate for the dashboard layout header. Pulls the three values
// the identity row actually displays — building count, unit count, and the
// subscriber's organization name. Anything heavier (open counts, neighborhood
// breakdowns, recent activity) belongs on the page that needs it.
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ buildings: 0, units: 0, organization: null })
  }

  const supabase = getSupabaseAdmin()

  const [subscriberRes, propertiesRes] = await Promise.all([
    supabase
      .from('subscribers')
      .select('organization, role, plan, subscription_status, trial_started_at')
      .eq('clerk_id', userId)
      .maybeSingle(),
    supabase
      .from('portfolio_properties')
      .select('id')
      .eq('user_id', userId),
  ])

  const properties = (propertiesRes.data ?? []) as Array<{ id: string }>
  const buildings = properties.length

  let units = 0
  if (buildings > 0) {
    const propIds = properties.map((p) => p.id)
    const { count } = await supabase
      .from('portfolio_property_units')
      .select('*', { count: 'exact', head: true })
      .in('portfolio_property_id', propIds)
    units = count ?? 0
  }

  const entitlement = computeEntitlement(
    subscriberRes.data
      ? {
          plan: (subscriberRes.data as { plan?: string | null }).plan ?? null,
          subscription_status: (subscriberRes.data as { subscription_status?: string | null }).subscription_status ?? null,
          trial_started_at: (subscriberRes.data as { trial_started_at?: string | null }).trial_started_at ?? null,
        }
      : null
  )

  return NextResponse.json({
    buildings,
    units,
    organization: (subscriberRes.data?.organization as string | null) ?? null,
    is_admin: subscriberRes.data?.role === 'admin',
    entitlement,
  })
}