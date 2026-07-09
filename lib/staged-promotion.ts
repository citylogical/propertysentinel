import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { OWNER_RELEVANT_CODES } from '@/lib/sr-codes'

// Promotion: copy staged_properties rows into portfolio_properties. The two
// callers are the entitled direct-commit route (admin/paying/enterprise skip
// Stripe) and the Stripe webhook on checkout.session.completed. Rows are a
// fat snapshot of the save payload, so this is a pure column copy plus the
// same post-save work the old save route did: SR-preference seeding on the
// user's first property, then activity stats per property.

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

async function promoteRows(
  supabase: SupabaseClient,
  rows: StagedPropertyRow[]
): Promise<PromotionResult> {
  const result: PromotionResult = { promoted: 0, errors: [] }
  if (rows.length === 0) return result

  await seedSrPreferences(supabase, rows[0].clerk_id)

  for (const row of rows) {
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
          year_built: row.year_built,
          implied_value: row.implied_value,
          community_area: row.community_area,
          property_class: row.property_class,
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

    // Materialize the self-reported unit count as portfolio_property_units
    // rows — the dashboard counts THOSE for building/unit totals, not
    // units_override. Only when the property has no unit rows yet, so a
    // re-promotion never duplicates a rent roll or manual entries.
    // Non-fatal per property.
    if (row.units && row.units > 0) {
      try {
        const { count: existingUnits } = await supabase
          .from('portfolio_property_units')
          .select('id', { count: 'exact', head: true })
          .eq('portfolio_property_id', inserted.id as string)
        if ((existingUnits ?? 0) === 0) {
          const unitRows = Array.from({ length: Math.min(row.units, 1000) }, (_, i) => ({
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
  stagedIds: string[]
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
  return promoteRows(supabase, (rows ?? []) as StagedPropertyRow[])
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
