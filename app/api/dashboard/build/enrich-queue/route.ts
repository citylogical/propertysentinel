// app/api/dashboard/build/enrich-queue/route.ts
//
// "Building your portfolio" step 2 feeder: the SR numbers at the caller's
// portfolio addresses that still need Aura enrichment. Scope: last 12 months
// (the enrichment window), owner-liability codes only (the default alert
// checklist minus WCA2 — see OWNER_ENRICHABLE_CODES), enriched_at IS NULL.
//
// Ordered NEWEST FIRST so the complaints the highlights modal surfaces are
// the first to enrich. Stateless resume: enrich-on-demand stamps enriched_at
// per SR, so re-querying returns only what's left.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAllAddresses, chunkedIn } from '@/lib/portfolio-stats'
import { OWNER_ENRICHABLE_CODES } from '@/lib/sr-codes'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_QUEUE = 500

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: props, error: propsErr } = await supabase
    .from('portfolio_properties')
    .select('canonical_address, address_range, additional_streets')
    .eq('user_id', userId)
  if (propsErr) return NextResponse.json({ error: propsErr.message }, { status: 500 })

  const allAddresses = new Set<string>()
  for (const p of (props ?? []) as Array<{
    canonical_address: string
    address_range: string | null
    additional_streets: string[] | null
  }>) {
    for (const a of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
      allAddresses.add(a)
    }
  }
  if (allAddresses.size === 0) {
    return NextResponse.json({ sr_numbers: [], total: 0 })
  }

  const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString()
  const codes = [...OWNER_ENRICHABLE_CODES]

  const { data: complaints, error: cErr } = await chunkedIn<{
    sr_number: string
    created_date: string | null
  }>(
    [...allAddresses],
    100,
    (chunk) =>
      supabase
        .from('complaints_311')
        .select('sr_number, created_date')
        .in('address_normalized', chunk)
        .in('sr_short_code', codes)
        .gte('created_date', twelveMonthsAgo)
        .is('enriched_at', null)
        .order('created_date', { ascending: false })
        .range(0, MAX_QUEUE - 1),
    (row) => row.sr_number
  )
  if (cErr) return NextResponse.json({ error: cErr }, { status: 500 })

  // chunkedIn preserves per-chunk order only — re-sort newest-first globally
  // so the highlights modal's top items enrich before anything else.
  const sorted = (complaints ?? [])
    .sort((a, b) => (b.created_date ?? '').localeCompare(a.created_date ?? ''))
    .slice(0, MAX_QUEUE)

  return NextResponse.json({
    sr_numbers: sorted.map((c) => c.sr_number),
    total: sorted.length,
  })
}
