import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'

export const maxDuration = 60

// Live-recomputed fields only — STR fields (is_pbl, str_registrations,
// is_restricted_zone, nearby_listings) are deliberately excluded: they stay
// on their cached values, refreshed only by import-rentroll / rederive-buildings.
type LiveStats = {
  open_complaints: number
  total_complaints_12mo: number
  open_building_complaints: number
  total_building_complaints_12mo: number
  latest_building_complaint_date: string | null
  open_violations: number
  total_violations_12mo: number
  total_permits_12mo: number
  shvr_count: number
  has_stop_work: boolean
}

// Cache key is the property id — a given building's live stats are cached
// ~5min, so repeated page views / re-sorts don't re-run the fan-out.
const cachedActivityForProperty = unstable_cache(
  async (
    propertyId: string,
    canonicalAddress: string,
    addressRange: string | null,
    additionalStreets: string[] | null,
    pins: string[] | null
  ): Promise<LiveStats> => {
    const supabase = getSupabaseAdmin()
    const activity = await fetchPortfolioActivity(
      supabase,
      canonicalAddress,
      addressRange,
      additionalStreets,
      pins,
      { skipStr: true }
    )
    const s = activity.stats
    return {
      open_complaints: s.open_complaints,
      total_complaints_12mo: s.total_complaints_12mo,
      open_building_complaints: s.open_building_complaints,
      total_building_complaints_12mo: s.total_building_complaints_12mo,
      latest_building_complaint_date: s.latest_building_complaint_date,
      open_violations: s.open_violations,
      total_violations_12mo: s.total_violations_12mo,
      total_permits_12mo: s.total_permits_12mo,
      shvr_count: s.shvr_count,
      has_stop_work: s.has_stop_work,
    }
  },
  ['portfolio-list-activity'],
  { revalidate: 300, tags: ['portfolio-activity'] }
)

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { propertyIds?: string[] }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  const propertyIds = Array.isArray(body.propertyIds)
    ? body.propertyIds.filter((x): x is string => typeof x === 'string')
    : []
  if (propertyIds.length === 0) {
    return NextResponse.json({ stats: {} })
  }
  // Hard cap — the dashboard never shows more than 100 rows per page.
  if (propertyIds.length > 100) {
    return NextResponse.json({ error: 'Too many property IDs' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch only the rows the caller owns — prevents enumerating other users' IDs.
  const { data: rows, error } = await supabase
    .from('portfolio_properties')
    .select('id, canonical_address, address_range, additional_streets, pins')
    .eq('user_id', userId)
    .in('id', propertyIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const statsById: Record<string, LiveStats> = {}

  await Promise.all(
    (rows ?? []).map(async (row) => {
      const r = row as {
        id: string
        canonical_address: string
        address_range: string | null
        additional_streets: string[] | null
        pins: string[] | null
      }
      try {
        const live = await cachedActivityForProperty(
          r.id,
          r.canonical_address,
          r.address_range,
          r.additional_streets,
          r.pins
        )
        statsById[r.id] = live

        // Persist-back — keep the cached portfolio_properties.* columns warm
        // so the next cold /api/dashboard/list load is already current.
        // STR columns deliberately omitted from this update.
        await supabase
          .from('portfolio_properties')
          .update({
            open_complaints: live.open_complaints,
            total_complaints_12mo: live.total_complaints_12mo,
            open_building_complaints: live.open_building_complaints,
            total_building_complaints_12mo: live.total_building_complaints_12mo,
            latest_building_complaint_date: live.latest_building_complaint_date,
            open_violations: live.open_violations,
            total_violations_12mo: live.total_violations_12mo,
            total_permits_12mo: live.total_permits_12mo,
            shvr_count: live.shvr_count,
            has_stop_work: live.has_stop_work,
            stats_updated_at: new Date().toISOString(),
          })
          .eq('id', r.id)
      } catch (e) {
        console.error(
          '[list-activity] failed for',
          r.canonical_address,
          e instanceof Error ? e.message : String(e)
        )
        // Leave this id out of statsById — client keeps the cached value.
      }
    })
  )

  return NextResponse.json({ stats: statsById })
}
