import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'

const ALLOWED_FIELDS = new Set([
  'display_name',
  'address_range',
  'additional_streets',
  'units_override',
  'sqft_override',
  'notes',
  'alerts_enabled',
  'year_built',
  'implied_value',
  'community_area',
  'property_class',
])

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { property_id?: string; patch?: Record<string, unknown> }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const propertyId = body.property_id
  const patch = body.patch ?? {}
  if (!propertyId || typeof propertyId !== 'string') {
    return NextResponse.json({ error: 'Missing property_id' }, { status: 400 })
  }

  const cleanPatch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_FIELDS.has(key)) continue
    // Empty strings become null for nullable text/number columns; arrays pass through as-is
    if (typeof value === 'string' && value.trim() === '') {
      cleanPatch[key] = null
    } else {
      cleanPatch[key] = value
    }
  }
  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ error: 'No editable fields in patch' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: existing, error: existingErr } = await supabase
    .from('portfolio_properties')
    .select('id, user_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (existingErr || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if ((existing as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('portfolio_properties')
    .update({ ...cleanPatch, updated_at: new Date().toISOString() })
    .eq('id', propertyId)
    .select('*')
    .maybeSingle()

  if (updateErr) {
    console.error('Property update error:', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // If the patch changed the address fan-out (address_range / additional_streets / pins),
  // the cached activity stats are now stale. Re-run fetchPortfolioActivity and write fresh
  // stats back to the row. Without this, edits that change which addresses get queried
  // would show old complaint/violation/permit counts until the next nightly backfill.
  const FAN_OUT_FIELDS = ['address_range', 'additional_streets', 'pins']
  const touchedFanOut = FAN_OUT_FIELDS.some((f) => f in cleanPatch)

  if (touchedFanOut && updated) {
    const u = updated as {
      canonical_address?: string | null
      address_range?: string | null
      additional_streets?: string[] | null
      pins?: string[] | null
      id: string
    }
    const canonical = typeof u.canonical_address === 'string' ? u.canonical_address.trim() : ''

    if (canonical) {
      try {
        const activity = await fetchPortfolioActivity(
          supabase,
          canonical,
          u.address_range ?? null,
          u.additional_streets ?? null,
          u.pins ?? null
        )
        const { data: refreshed, error: refreshErr } = await supabase
          .from('portfolio_properties')
          .update({
            ...activity.stats,
            stats_updated_at: new Date().toISOString(),
          })
          .eq('id', u.id)
          .select('*')
          .maybeSingle()

        if (refreshErr) {
          console.error('Property update — activity refresh failed (row still updated):', refreshErr)
          return NextResponse.json({ property: updated, activity_refresh_error: refreshErr.message })
        }
        return NextResponse.json({ property: refreshed ?? updated })
      } catch (e) {
        console.error('Property update — activity refresh threw (row still updated):', e)
        return NextResponse.json({
          property: updated,
          activity_refresh_error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  return NextResponse.json({ property: updated })
}
