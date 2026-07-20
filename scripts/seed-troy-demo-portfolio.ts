// scripts/seed-troy-demo-portfolio.ts
//
// Seeds the Troy Realty public demo portfolio (/demo/troy-realty) with the
// top 50 Troy Realty listings, ranked by 12-month owner-relevant 311
// complaints (see scripts/sql/troy_realty_portfolio_demo.sql for the ranking
// query the list came from).
//
// ── HOW TO RUN ───────────────────────────────────────────────────────────────
//   npx tsx --env-file=.env.local scripts/seed-troy-demo-portfolio.ts --dry-run
//   npx tsx --env-file=.env.local scripts/seed-troy-demo-portfolio.ts --apply
//
//   The --env-file flag is REQUIRED (same reason as hansen-portfolio-backfill):
//   lib/supabase reads NEXT_PUBLIC_SUPABASE_URL at module load. Needs
//   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// ── WHAT IT DOES ─────────────────────────────────────────────────────────────
//   This is the NORMAL upload path, not a bespoke insert. It:
//     1. Resolves PINs for each address from `properties` (same lookup the
//        save flow uses).
//     2. Upserts the 50 rows into staged_properties (status 'staged') under
//        the demo user_id from lib/demo-portfolios.ts.
//     3. Calls promoteStagedRowsForUser() — the exact function the entitled
//        commit route and the Stripe webhook call — which seeds
//        user_sr_preferences (29 owner-relevant codes), upserts
//        portfolio_properties, and computes live activity stats per property
//        (~1-2s each, so expect the apply run to take a couple of minutes).
//
//   Because the rows land through the production path with canonical
//   normalized addresses, every read surface (demo page, activity feed,
//   Worker C's nightly stats refresh) treats them like any customer
//   portfolio — the demo live-updates with no further maintenance.
//
//   The demo user_id deliberately has NO subscribers row: the daily digest
//   iterates subscribers, so nothing ever emails from this portfolio, and
//   there is no Stripe subscription to reconcile.
//
// ── RE-RUNNING ───────────────────────────────────────────────────────────────
//   Idempotent. Re-running --apply re-stages and re-promotes the same rows
//   (upsert on user_id,canonical_address) and refreshes their cached stats.

import { getSupabaseAdmin } from '../lib/supabase'
import { promoteStagedRowsForUser } from '../lib/staged-promotion'
import { resolveAddressesToProperties } from '../lib/address-resolution'
import { addressToSlug } from '../lib/formatAddress'
import { DEMO_PORTFOLIOS } from '../lib/demo-portfolios'

const DEMO = DEMO_PORTFOLIOS['troy-realty']

// Top 50 by 12-month owner-relevant complaints — single source of truth in
// lib/demo-portfolios.ts, shared with the browser-clickable admin route
// (app/api/admin/seed-demo-portfolio), which is the no-local-env alternative
// to this script.
// This script only handles pre-resolved entries; raw entries (customer rent
// rolls) are resolved by the admin seed route's resolve phase instead.
const PROPERTIES = DEMO.seedProperties.filter(
  (p): p is (typeof DEMO.seedProperties)[number] & { canonical: string } => !!p.canonical
)

const args = process.argv.slice(2)
const DRY_RUN = !args.includes('--apply')

async function main() {
  if (!DEMO) throw new Error('troy-realty missing from DEMO_PORTFOLIOS')
  const supabase = getSupabaseAdmin()

  console.log(`Demo user: ${DEMO.userId}`)
  console.log(`Properties: ${PROPERTIES.length}`)
  console.log(DRY_RUN ? 'MODE: dry run (pass --apply to write)\n' : 'MODE: APPLY\n')

  // Resolve PINs for canonical + alias forms in one batched round-trip.
  const lookupAddresses = PROPERTIES.flatMap((p) => [p.canonical, ...(p.aliases ?? [])])
  const resolved = await resolveAddressesToProperties(lookupAddresses)

  const stagedRows = PROPERTIES.map((p) => {
    const pins = new Set<string>()
    for (const addr of [p.canonical, ...(p.aliases ?? [])]) {
      for (const match of resolved.get(addr) ?? []) {
        if (match.pin) pins.add(match.pin)
      }
    }
    return {
      clerk_id: DEMO.userId,
      canonical_address: p.canonical,
      slug: addressToSlug(p.canonical),
      property_name: null,
      units: p.units ?? null, // when unit mix is unknown, no unit rows materialize
      address_range: null,
      additional_streets: p.aliases?.length ? p.aliases : null,
      pins: pins.size > 0 ? Array.from(pins) : null,
      sqft: null,
      year_built: null,
      implied_value: null,
      community_area: null,
      property_class: null,
      status: 'staged',
      updated_at: new Date().toISOString(),
    }
  })

  const noPins = stagedRows.filter((r) => !r.pins)
  for (const r of stagedRows) {
    console.log(
      `  ${r.canonical_address.padEnd(28)} pins=${r.pins?.length ?? 0}` +
        (r.additional_streets ? `  aliases=[${r.additional_streets.join(', ')}]` : '')
    )
  }
  if (noPins.length > 0) {
    console.log(
      `\n⚠ ${noPins.length} address(es) resolved zero PINs — activity still matches by ` +
        `address string, but the assessor sidebar will be empty for these.`
    )
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run with --apply to stage + promote.')
    return
  }

  const { data: staged, error: stageErr } = await supabase
    .from('staged_properties')
    .upsert(stagedRows, { onConflict: 'clerk_id,canonical_address' })
    .select('id, canonical_address')

  if (stageErr || !staged) {
    throw new Error(`staged_properties upsert failed: ${stageErr?.message}`)
  }
  console.log(`\nStaged ${staged.length} rows. Promoting (computes live stats, ~1-2s/property)…`)

  const result = await promoteStagedRowsForUser(
    supabase,
    DEMO.userId,
    staged.map((s) => s.id as string)
  )

  console.log(`\nPromoted: ${result.promoted}/${staged.length}`)
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.join(', ')}`)
  }

  const { count } = await supabase
    .from('portfolio_properties')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', DEMO.userId)
  console.log(`portfolio_properties rows for ${DEMO.userId}: ${count}`)
  console.log('\nDone. The demo reads live from these rows at /demo/troy-realty.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
