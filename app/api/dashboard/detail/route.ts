import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('id')
  if (!propertyId) {
    return NextResponse.json({ error: 'Missing property id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: prop, error: propErr } = await supabase
    .from('portfolio_properties')
    .select('*')
    .eq('id', propertyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (propErr || !prop) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const row = prop as {
    canonical_address?: string | null
    address_range?: string | null
    additional_streets?: string[] | null
  }

  const canonical = typeof row.canonical_address === 'string' ? row.canonical_address.trim() : ''
  if (!canonical) {
    return NextResponse.json({
      recent_complaints: [],
      recent_violations: [],
      recent_permits: [],
      latest_violation_date: null,
      latest_permit_date: null,
      str_registrations: 0,
      is_restricted_zone: false,
      nearby_listings: 0,
    })
  }

  const result = await fetchPortfolioActivity(
    supabase,
    canonical,
    row.address_range ?? null,
    row.additional_streets ?? null
  )

  const v0 = result.recent_violations[0] as { violation_date?: string | null } | undefined
  const p0 = result.recent_permits[0] as { issue_date?: string | null } | undefined

  return NextResponse.json({
    recent_complaints: result.recent_complaints,
    recent_violations: result.recent_violations,
    recent_permits: result.recent_permits,
    latest_violation_date: v0?.violation_date ?? null,
    latest_permit_date: p0?.issue_date ?? null,
    str_registrations: result.stats.str_registrations,
    is_restricted_zone: result.stats.is_restricted_zone,
    nearby_listings: result.stats.nearby_listings,
  })
}
