import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { OWNER_RELEVANT_CODES } from '@/lib/sr-codes'
import { fetchParcelUniverse } from '@/lib/supabase-search'
import { getPortfolioSaveBuildingSnapshot } from '@/lib/portfolio-save-building-snapshot'

// Promotion: copy staged_properties rows into portfolio_properties. The two
// callers are the entitled direct-commit route (admin/paying/enterprise skip
// Stripe) and the Stripe webhook on checkout.session.completed. Rows are a
// fat snapshot of the save payload, so this is a pure column copy plus the
// same post-save work the old save route did: SR-preference seeding on the
// user's first property, then activity stats per property.
//
// Parcel-characteristics invariant: the two UI entry points populate
// year_built / implied_value / community_area / property_class BEFORE staging
// (the address page ships its rendered assessor sidebar with the stage POST;
// the rent-roll importer resolves them server-side). Direct seeders — demo
// portfolios, ad-hoc scripts — stage rows without them, so promotion now
// enforces the invariant itself: see resolveParcelCharacteristics.

type StagedPropertyRow = {
  id: string
  clerk_id: string
  canonical_address: string
  slug: string
  property_name: string | null
  units: number | null
  address_range: string | null
  additional_streets: string[] | null
  pins: string[] | null
  sqft: number | null
  year_built: string | null
  implied_value: number | null
  community_area: string | null
  property_class: string | null
}

export type PromotionResult = {
  promoted: number
  errors: string[]
}

async function seedSrPreferences(supabase: SupabaseClient, clerkId: string): Promise<void> {
  // Presence of a row in user_sr_preferences = code enabled. Seed the
  // owner-relevant defaults only when the user has zero rows, so codes they
  // turned off never come back. Non-fatal.
  try {
    const { count } = await supabase
      .from('user_sr_preferences')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', clerkId)
    if ((count ?? 0) === 0) {
      const seedRows = Array.from(OWNER_RELEVANT_CODES).map((code) => ({
        user_id: clerkId,
        sr_short_code: code,
      }))
      await supabase
        .from('user_sr_preferences')
        .upsert(seedRows, { onConflict: 'user_id,sr_short_code', ignoreDuplicates: true })
    }
  } catch (err) {
    console.error('SR preference seed failed (non-fatal):', err)
  }
}

type ParcelCharacteristics = {
  year_built: string | null
  implied_value: number | null
  community_area: string | null
  property_class: string | null
}

/**
 * Decide what the four parcel-characteristic columns should be for a row
 * being promoted. Three cases, cheapest first:
 *
 *   1. The staged row carries any of them (both UI flows do) → use staged
 *      values verbatim, exactly as promotion always has.
 *   2. The staged row has none, but the portfolio row being upserted over
 *      already does (e.g. a rederive-buildings backfill, or a prior
 *      promotion that derived them) → preserve the existing values instead
 *      of clobbering them back to null on re-promotion.
 *   3. Nothing anywhere and the row has PINs → derive from parcel data with
 *      the same helpers the assessor sidebar and rederive-buildings use
 *      (fetchParcelUniverse for community area, getPortfolioSaveBuildingSnapshot
 *      for the rest). Non-fatal: on any failure the row promotes with nulls,
 *      same as before this fallback existed.
 */
async function resolveParcelCharacteristics(
  supabase: SupabaseClient,
  row: StagedPropertyRow
): Promise<ParcelCharacteristics> {
  const staged: ParcelCharacteristics = {
    year_built: row.year_built,
    implied_value: row.implied_value,
    community_area: row.community_area,
    property_class: row.property_class,
  }
  const stagedHasAny =
    staged.year_built != null ||
    staged.implied_value != null ||
    staged.community_area != null ||
    staged.property_class != null
  if (stagedHasAny) return staged

  try {
    const { data: existing } = await supabase
      .from('portfolio_properties')
      .select('year_built, implied_value, community_area, property_class')
      .eq('user_id', row.clerk_id)
      .eq('canonical_address', row.canonical_address)
      .maybeSingle()
    if (
      existing &&
      (existing.year_built != null ||
        existing.implied_value != null ||
        existing.community_area != null ||
        existing.property_class != null)
    ) {
      return {
        year_built: (existing.year_built as string | null) ?? null,
        implied_value: (existing.implied_value as number | null) ?? null,
        community_area: (existing.community_area as string | null) ?? null,
        property_class: (existing.property_class as string | null) ?? null,
      }
    }

    const pins = row.pins ?? []
    if (pins.length === 0) return staged

    const primaryPin = pins[0]
    const { parcel } = await fetchParcelUniverse(primaryPin)
    const snapshot = await getPortfolioSaveBuildingSnapshot({
      normalizedPin: primaryPin,
      siblingPins: pins,
      useMultiPinImplied: pins.length > 1,
      propertyClassFallback: null,
      communityArea: parcel?.community_area_name?.trim() ?? null,
    })
    return {
      year_built: snapshot.yearBuilt,
      implied_value: snapshot.impliedValue,
      community_area: snapshot.communityArea,
      property_class: snapshot.propertyClass,
    }
  } catch (err) {
    console.error('Parcel characteristics fallback failed (non-fatal):', row.canonical_address, err)
    return staged
  }
}

type PromoteOptions = {
  /**
   * Skip the per-property activity-stats computation (the slow part —
   * ~1-2s/property). Used by the entitled commit path so large portfolios
   * promote instantly; the client-driven build loop (or Worker C's nightly
   * phase 3) fills stats in afterward via stats_updated_at IS NULL. The
   * Stripe webhook path keeps the default (stats inline) — its behavior is
   * unchanged.
   */
  skipStats?: boolean
}

async function promoteRows(
  supabase: SupabaseClient,
  rows: StagedPropertyRow[],
  opts?: PromoteOptions
): Promise<PromotionResult> {
  const result: PromotionResult = { promoted: 0, errors: [] }
  if (rows.length === 0) return result

  await seedSrPreferences(supabase, rows[0].clerk_id)

  for (const row of rows) {
    const chars = await resolveParcelCharacteristics(supabase, row)

    const { data: inserted, error } = await supabase
      .from('portfolio_properties')
      .upsert(
        {
          user_id: row.clerk_id,
          canonical_address: row.canonical_address,
          address_range: row.address_range,
          additional_streets: row.additional_streets?.length ? row.additional_streets : null,
          pins: row.pins?.length ? row.pins : null,
          slug: row.slug,
          display_name: row.property_name || row.canonical_address,
          units_override: row.units,
          sqft_override: row.sqft,
          alerts_enabled: true,
          alert_email: true,
          alert_sms: false,
          updated_at: new Date().toISOString(),
          year_built: chars.year_built,
          implied_value: chars.implied_value,
          community_area: chars.community_area,
          property_class: chars.property_class,
        },
        { onConflict: 'user_id,canonical_address' }
      )
      .select('id')
      .single()

    if (error || !inserted?.id) {
      console.error('Staged promotion upsert failed:', row.canonical_address, error)
      result.errors.push(row.canonical_address)
      continue
    }

    await supabase
      .from('staged_properties')
      .update({
        status: 'promoted',
        promoted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    result.promoted++

    // Materialize unit rows in portfolio_property_units — the dashboard
    // counts THOSE for building/unit totals, not units_override. Only when
    // the property has no unit rows yet, so a re-promotion never duplicates
    // a rent roll or manual entries. Rent-roll imports park real unit detail
    // (label, bd/ba, rent, lease dates) in staged_property_units at commit
    // time; when present those are copied verbatim, otherwise fall back to
    // the synthetic "Unit 1..N" self-reported rows. Non-fatal per property.
    if (row.units && row.units > 0) {
      try {
        const { count: existingUnits } = await supabase
          .from('portfolio_property_units')
          .select('id', { count: 'exact', head: true })
          .eq('portfolio_property_id', inserted.id as string)
        if ((existingUnits ?? 0) === 0) {
          const { data: stagedUnits, error: stagedUnitsErr } = await supabase
            .from('staged_property_units')
            .select('unit_label, bd_ba, status, rent, lease_from, lease_to, move_in, move_out')
            .eq('staged_property_id', row.id)
            .order('created_at', { ascending: true })
            .range(0, 999)
          if (stagedUnitsErr) {
            // Fall through to synthetic units, but leave a trace — otherwise a
            // transient read failure silently discards real rent-roll detail.
            console.error(
              'staged_property_units read failed, falling back to synthetic units:',
              row.canonical_address,
              stagedUnitsErr
            )
          }
          const unitRows =
            stagedUnits && stagedUnits.length > 0
              ? stagedUnits.map((u) => ({
                  portfolio_property_id: inserted.id as string,
                  ...u,
                  source: 'rent_roll',
                }))
              : Array.from({ length: Math.min(row.units, 1000) }, (_, i) => ({
                  portfolio_property_id: inserted.id as string,
                  unit_label: `Unit ${i + 1}`,
                  source: 'self_reported',
                }))
          await supabase.from('portfolio_property_units').insert(unitRows)
        }
      } catch (unitsErr) {
        console.error('Unit row creation failed (non-fatal):', row.canonical_address, unitsErr)
      }
    }

    // Activity stats, same as the old save route. Non-fatal per property.
    if (opts?.skipStats) continue
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
        .eq('id', inserted.id as string)
    } catch (statsErr) {
      console.error('Promotion stats computation failed (non-fatal):', row.canonical_address, statsErr)
    }
  }

  return result
}

const STAGED_SELECT =
  'id, clerk_id, canonical_address, slug, property_name, units, address_range, additional_streets, pins, sqft, year_built, implied_value, community_area, property_class'

/** Promote specific staged rows for a user (entitled direct-commit path). */
export async function promoteStagedRowsForUser(
  supabase: SupabaseClient,
  clerkId: string,
  stagedIds: string[],
  opts?: PromoteOptions
): Promise<PromotionResult> {
  if (stagedIds.length === 0) return { promoted: 0, errors: [] }
  const { data: rows, error } = await supabase
    .from('staged_properties')
    .select(STAGED_SELECT)
    .eq('clerk_id', clerkId)
    .in('id', stagedIds)
    .in('status', ['staged', 'pending_checkout'])
  if (error) {
    console.error('Staged promotion fetch failed:', error)
    return { promoted: 0, errors: ['fetch_failed'] }
  }
  return promoteRows(supabase, (rows ?? []) as StagedPropertyRow[], opts)
}

/** Promote the rows stamped with a checkout session (webhook path). */
export async function promoteStagedRowsForSession(
  supabase: SupabaseClient,
  checkoutSessionId: string
): Promise<PromotionResult> {
  const { data: rows, error } = await supabase
    .from('staged_properties')
    .select(STAGED_SELECT)
    .eq('checkout_session_id', checkoutSessionId)
    .eq('status', 'pending_checkout')
  if (error) {
    console.error('Staged promotion fetch failed:', error)
    return { promoted: 0, errors: ['fetch_failed'] }
  }
  return promoteRows(supabase, (rows ?? []) as StagedPropertyRow[])
}
