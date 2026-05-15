// scripts/hansen-portfolio-diff.ts
// Read-only. For each row in GC's portfolio, runs fetchPortfolioActivity
// twice — once with GC's pre-Hansen values, once with the mirror's
// Hansen-corrected values — and prints rows whose counts changed.
// No writes. Counts only (skipStr: true).

import { getSupabaseAdmin } from '../lib/supabase'
import { fetchPortfolioActivity } from '../lib/portfolio-stats'

const GC_USER     = 'user_3DYLjdKurzsSliwno7vqkj26It6'
const MIRROR_USER = 'user_3BBPo3OLOM46aZbnBFg99iXsiIg'

type Row = {
  canonical_address: string
  address_range: string | null
  additional_streets: string[] | null
  pins: string[] | null
}

async function main() {
  const supabase = getSupabaseAdmin()

  const { data: gcRows } = await supabase
    .from('portfolio_properties')
    .select('canonical_address, address_range, additional_streets, pins')
    .eq('user_id', GC_USER)
  const { data: mirrorRows } = await supabase
    .from('portfolio_properties')
    .select('canonical_address, address_range, additional_streets, pins')
    .eq('user_id', MIRROR_USER)

  const mirrorByCanon = new Map(
    (mirrorRows as Row[]).map((r) => [r.canonical_address, r])
  )

  const diffs: Array<{
    canon: string
    complaints: [number, number]
    violations: [number, number]
    permits: [number, number]
    delta: number
  }> = []

  let i = 0
  for (const gc of (gcRows as Row[])) {
    i++
    const mirror = mirrorByCanon.get(gc.canonical_address)
    if (!mirror) {
      // 600 N LAKE SHORE — canonical was renamed on the mirror, can't pair
      console.log(`[${i}/${gcRows!.length}] ${gc.canonical_address} — no mirror match, skipped`)
      continue
    }

    try {
      const [before, after] = await Promise.all([
        fetchPortfolioActivity(supabase, gc.canonical_address,
          gc.address_range, gc.additional_streets, gc.pins, { skipStr: true }),
        fetchPortfolioActivity(supabase, mirror.canonical_address,
          mirror.address_range, mirror.additional_streets, mirror.pins, { skipStr: true }),
      ])

      const bc = before.stats.total_complaints_12mo
      const ac = after.stats.total_complaints_12mo
      const bv = before.stats.total_violations_12mo
      const av = after.stats.total_violations_12mo
      const bp = before.stats.total_permits_12mo
      const ap = after.stats.total_permits_12mo
      const delta = (ac - bc) + (av - bv) + (ap - bp)

      if (delta !== 0) {
        diffs.push({
          canon: gc.canonical_address,
          complaints: [bc, ac],
          violations: [bv, av],
          permits: [bp, ap],
          delta,
        })
      }
      process.stdout.write(`[${i}/${gcRows!.length}] ${gc.canonical_address}: Δ${delta}\n`)
    } catch (e) {
      console.log(`[${i}/${gcRows!.length}] ${gc.canonical_address} — ERROR ${e instanceof Error ? e.message : e}`)
    }
  }

  diffs.sort((a, b) => b.delta - a.delta)
  console.log('\n' + '─'.repeat(80))
  console.log('ROWS WITH CHANGED COUNTS (sorted by absolute delta, descending)')
  console.log('─'.repeat(80))
  console.log(`canonical · complaints (before→after) · violations (b→a) · permits (b→a) · Δ`)
  for (const d of diffs) {
    console.log(
      `${d.canon} · c ${d.complaints[0]}→${d.complaints[1]} · ` +
      `v ${d.violations[0]}→${d.violations[1]} · ` +
      `p ${d.permits[0]}→${d.permits[1]} · Δ${d.delta}`
    )
  }
  console.log(`\nTotal rows with changes: ${diffs.length} / ${gcRows!.length}`)
  const totalDelta = diffs.reduce((s, d) => s + d.delta, 0)
  console.log(`Aggregate delta across portfolio: ${totalDelta} records found`)
}

main().catch((e) => { console.error(e); process.exit(1) })