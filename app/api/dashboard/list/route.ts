import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: properties, error } = await supabase
    .from('portfolio_properties')
    .select(
      `
      id,
      canonical_address,
      address_range,
      additional_streets,
      pins,
      slug,
      display_name,
      units_override,
      sqft_override,
      notes,
      alerts_enabled,
      created_at,
      open_complaints,
      total_complaints_12mo,
      open_violations,
      total_violations_12mo,
      total_permits_12mo,
      shvr_count,
      is_pbl,
      has_stop_work,
      str_registrations,
      is_restricted_zone,
      implied_value,
      property_class,
      year_built,
      community_area,
      stats_updated_at
    `
    )
    .eq('user_id', userId)
    .order('canonical_address', { ascending: true })

  if (error) {
    console.error('Portfolio list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const mapped = (properties ?? []).map((p) => ({
    id: p.id as string,
    canonical_address: p.canonical_address as string,
    address_range: (p.address_range as string | null) ?? null,
    additional_streets: (p.additional_streets as string[] | null) ?? null,
    pins: (p.pins as string[] | null) ?? null,
    slug: p.slug as string,
    display_name: (p.display_name as string | null) ?? null,
    units_override: (p.units_override as number | null) ?? null,
    sqft_override: (p.sqft_override as number | null) ?? null,
    notes: (p.notes as string | null) ?? null,
    alerts_enabled: Boolean(p.alerts_enabled),
    created_at: p.created_at as string,
    open_violations: Number(p.open_violations ?? 0),
    open_complaints: Number(p.open_complaints ?? 0),
    total_complaints_12mo: Number(p.total_complaints_12mo ?? 0),
    total_violations_12mo: Number(p.total_violations_12mo ?? 0),
    total_permits: Number(p.total_permits_12mo ?? 0),
    shvr_count: Number(p.shvr_count ?? 0),
    is_pbl: Boolean(p.is_pbl),
    has_stop_work: Boolean(p.has_stop_work),
    str_registrations: Number(p.str_registrations ?? 0),
    is_restricted_zone: Boolean(p.is_restricted_zone),
    implied_value: (p.implied_value as number | null) ?? null,
    community_area: (p.community_area as string | null) ?? null,
    property_class: (p.property_class as string | null) ?? null,
    building_chars: {
      year_built: (p.year_built as number | string | null) ?? null,
    },
    latest_violation_date: null,
    latest_permit_date: null,
    recent_complaints: [] as Record<string, unknown>[],
    recent_violations: [] as Record<string, unknown>[],
    recent_permits: [] as Record<string, unknown>[],
  }))

  return NextResponse.json({ properties: mapped })
}
