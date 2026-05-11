import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchParcelUniverse } from '@/lib/supabase-search'
import { getPortfolioSaveBuildingSnapshot } from '@/lib/portfolio-save-building-snapshot'

export const maxDuration = 60

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // Localhost bypass — matches other admin routes
  if (process.env.NODE_ENV !== 'development') {
    const { data: caller } = await supabase
      .from('subscribers')
      .select('role, is_admin')
      .eq('clerk_id', userId)
      .maybeSingle()
    if (caller?.role !== 'admin' && !caller?.is_admin) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }
  }

  let body: { targetUserId?: string; propertyIds?: string[]; dryRun?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const targetUserId = body.targetUserId ?? userId
  const dryRun = body.dryRun === true
  const propertyIds = Array.isArray(body.propertyIds) ? body.propertyIds : null

  let query = supabase
    .from('portfolio_properties')
    .select('id, canonical_address, pins, property_class, year_built, implied_value, community_area')
    .eq('user_id', targetUserId)

  if (propertyIds && propertyIds.length > 0) {
    query = query.in('id', propertyIds)
  }

  const { data: rows, error: fetchErr } = await query

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  type FieldSet = {
    year_built: string | null
    implied_value: number | null
    property_class: string | null
    community_area: string | null
  }
  type Change = {
    id: string
    canonical_address: string
    before: FieldSet
    after: FieldSet
    diff: string[]
    skipped?: string
  }

  const changes: Change[] = []
  let updated = 0
  let skipped = 0
  let failed = 0
  let processed = 0

  for (const row of (rows ?? []) as Array<{
    id: string
    canonical_address: string
    pins: string[] | null
    property_class: string | null
    year_built: string | null
    implied_value: number | null
    community_area: string | null
  }>) {
    processed++
    if (processed % 25 === 0) {
      console.log(`[rederive-buildings] processed ${processed}/${rows?.length ?? 0}`)
    }

    const before: FieldSet = {
      year_built: row.year_built,
      implied_value: row.implied_value,
      property_class: row.property_class,
      community_area: row.community_area,
    }

    const pins = row.pins ?? []
    if (pins.length === 0) {
      skipped++
      changes.push({
        id: row.id,
        canonical_address: row.canonical_address,
        before,
        after: before,
        diff: [],
        skipped: 'no PINs (blind import)',
      })
      continue
    }

    try {
      const primaryPin = pins[0]
      const { parcel } = await fetchParcelUniverse(primaryPin)
      const communityArea = parcel?.community_area_name?.trim() ?? null

      const snapshot = await getPortfolioSaveBuildingSnapshot({
        normalizedPin: primaryPin,
        siblingPins: pins,
        useMultiPinImplied: pins.length > 1,
        propertyClassFallback: row.property_class,
        communityArea,
      })

      const after: FieldSet = {
        year_built: snapshot.yearBuilt,
        implied_value: snapshot.impliedValue,
        property_class: snapshot.propertyClass,
        community_area: snapshot.communityArea,
      }

      const diff: string[] = []
      if (before.year_built !== after.year_built) diff.push('year_built')
      if (before.implied_value !== after.implied_value) diff.push('implied_value')
      if (before.property_class !== after.property_class) diff.push('property_class')
      if (before.community_area !== after.community_area) diff.push('community_area')

      changes.push({
        id: row.id,
        canonical_address: row.canonical_address,
        before,
        after,
        diff,
      })

      if (!dryRun && diff.length > 0) {
        const { error: updErr } = await supabase
          .from('portfolio_properties')
          .update({
            year_built: after.year_built,
            implied_value: after.implied_value,
            property_class: after.property_class,
            community_area: after.community_area,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)

        if (updErr) {
          failed++
          console.error('Re-derive update failed:', row.canonical_address, updErr.message)
        } else {
          updated++
        }
      } else if (diff.length > 0) {
        updated++ // dry run counts as "would update"
      }
    } catch (e) {
      failed++
      console.error('Re-derive failed:', row.canonical_address, e instanceof Error ? e.message : String(e))
    }
  }

  // Summary aggregates
  const changedRows = changes.filter((c) => c.diff.length > 0)
  const fieldFlipCounts: Record<string, number> = {
    year_built: 0,
    implied_value: 0,
    property_class: 0,
    community_area: 0,
  }
  for (const c of changedRows) {
    for (const f of c.diff) fieldFlipCounts[f] = (fieldFlipCounts[f] ?? 0) + 1
  }

  return NextResponse.json({
    total: rows?.length ?? 0,
    updated,
    skipped,
    failed,
    unchanged: (rows?.length ?? 0) - updated - skipped - failed,
    dry_run: dryRun,
    target_user_id: targetUserId,
    field_flips: fieldFlipCounts,
    changes,
  })
}
