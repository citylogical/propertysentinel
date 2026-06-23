import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { addressToSlug } from '@/lib/formatAddress'
import { computeEntitlement } from '@/lib/entitlement'

// Street type tokens used to identify the end of an address proper (everything
// after one of these is treated as a unit suffix and stripped for matching).
const STREET_TYPES = new Set([
  'ST', 'AVE', 'BLVD', 'DR', 'CT', 'PL', 'LN', 'RD',
  'WAY', 'PKWY', 'TER', 'CIR', 'HWY',
])

type UserBuildingRange = {
  searched_address: string | null
  street1_low: string | null
  street1_high: string | null
  street2_low: string | null
  street2_high: string | null
  street3_low: string | null
  street3_high: string | null
  street4_low: string | null
  street4_high: string | null
}

function stripUnitSuffix(normalizedAddress: string): string {
  const tokens = normalizedAddress.trim().toUpperCase().split(/\s+/)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STREET_TYPES.has(tokens[i])) {
      return tokens.slice(0, i + 1).join(' ')
    }
  }
  return normalizedAddress.toUpperCase().trim()
}

function findCoveringRange(
  baseAddress: string,
  ranges: UserBuildingRange[]
): UserBuildingRange | null {
  const baseParts = baseAddress.split(/\s+/)
  const baseNum = parseInt(baseParts[0] ?? '', 10)
  const baseStreet = baseParts.slice(1).join(' ')
  if (Number.isNaN(baseNum) || !baseStreet) return null

  for (const r of ranges) {
    for (let i = 1; i <= 4; i++) {
      const low = r[`street${i}_low` as keyof UserBuildingRange] as string | null
      const high = r[`street${i}_high` as keyof UserBuildingRange] as string | null
      if (!low || !high) continue
      const lowParts = low.toUpperCase().split(/\s+/)
      const highParts = high.toUpperCase().split(/\s+/)
      const lowNum = parseInt(lowParts[0] ?? '', 10)
      const highNum = parseInt(highParts[0] ?? '', 10)
      const lowStreet = lowParts.slice(1).join(' ')
      const highStreet = highParts.slice(1).join(' ')
      if (Number.isNaN(lowNum) || Number.isNaN(highNum)) continue
      if (lowStreet !== baseStreet || highStreet !== baseStreet) continue
      if (baseNum >= Math.min(lowNum, highNum) && baseNum <= Math.max(lowNum, highNum)) {
        return r
      }
    }
  }
  return null
}

function buildNavSlug(
  canonical: string,
  storedSlug: string | null,
  ranges: UserBuildingRange[]
): string {
  const baseAddress = stripUnitSuffix(canonical)
  const match = findCoveringRange(baseAddress, ranges)
  if (!match?.searched_address) return storedSlug ?? ''

  const zipMatch = storedSlug?.match(/-(\d{5})$/)
  const zip = zipMatch?.[1] ?? null
  const baseSlug = addressToSlug(match.searched_address)
  return zip ? `${baseSlug}-chicago-${zip}` : baseSlug
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Entitlement gate: admins always pass; everyone else must be entitled.
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

  const { data: unitRows } = await supabase
    .from('portfolio_property_units')
    .select('id, portfolio_property_id, unit_label, bd_ba, tag, status, rent, lease_from, lease_to, move_in, move_out, ob_date, source, created_at, updated_at')
    .eq('portfolio_property_id', propertyId)
    .order('unit_label', { ascending: true, nullsFirst: false })

  const units = unitRows ?? []

  const row = prop as {
    canonical_address?: string | null
    address_range?: string | null
    additional_streets?: string[] | null
    pins?: string[] | null
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
      units,
    })
  }

  // Fetch activity and approved building ranges in parallel. Ranges are used
  // to derive a nav slug that decodes to an address findApprovedUserRange
  // direct-matches on the property page — same pattern as the activity feed
  // and daily-digest cron. No user_id filter on ranges: ubr is reference data
  // once approved.
  const [activityResult, rangesResult] = await Promise.all([
    fetchPortfolioActivity(
      supabase,
      canonical,
      row.address_range ?? null,
      row.additional_streets ?? null,
      row.pins ?? null
    ),
    supabase
      .from('user_building_ranges')
      .select('searched_address, street1_low, street1_high, street2_low, street2_high, street3_low, street3_high, street4_low, street4_high')
      .eq('status', 'approved'),
  ])

  const result = activityResult
  const userRanges = (rangesResult.data ?? []) as UserBuildingRange[]
  const storedSlug =
    typeof (prop as { slug?: string | null }).slug === 'string'
      ? (prop as { slug: string }).slug
      : null
  const navSlug = buildNavSlug(canonical, storedSlug, userRanges)

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
    units,
    nav_slug: navSlug,
  })
}
