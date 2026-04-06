import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type AddressCounts = { complaints: number; violations: number; permits: number }

export async function POST(req: NextRequest) {
  let body: { addresses?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const addresses = (body.addresses ?? []).filter(
    (a): a is string => typeof a === 'string' && a.trim() !== ''
  )
  if (addresses.length === 0) {
    return NextResponse.json({
      counts: {} as Record<string, AddressCounts>,
    })
  }

  const supabase = getSupabaseAdmin()
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const since = oneYearAgo.toISOString().slice(0, 19)

  // Three queries total — one per table — using .in() on the batch of addresses.
  // We fetch only address_normalized for each matching row, then tally counts in JS.
  // For 25 addresses × ~5-20 records/addr/year, this returns ~500-1500 rows total,
  // which is trivial compared to 75 round-trips for .count() head queries.
  // High limit avoids PostgREST default max-rows undervaluing dense addresses.
  const rowCap = 100_000
  const [complaintsRes, violationsRes, permitsRes] = await Promise.all([
    supabase
      .from('complaints_311')
      .select('address_normalized')
      .in('address_normalized', addresses)
      .gte('created_date', since)
      .limit(rowCap),
    supabase
      .from('violations')
      .select('address_normalized')
      .in('address_normalized', addresses)
      .gte('violation_date', since)
      .limit(rowCap),
    supabase
      .from('permits')
      .select('address_normalized')
      .in('address_normalized', addresses)
      .gte('issue_date', since)
      .limit(rowCap),
  ])

  const counts: Record<string, AddressCounts> = {}
  for (const addr of addresses) {
    counts[addr] = { complaints: 0, violations: 0, permits: 0 }
  }

  for (const row of complaintsRes.data ?? []) {
    const a = (row as { address_normalized?: string | null }).address_normalized
    if (a && counts[a]) counts[a].complaints += 1
  }
  for (const row of violationsRes.data ?? []) {
    const a = (row as { address_normalized?: string | null }).address_normalized
    if (a && counts[a]) counts[a].violations += 1
  }
  for (const row of permitsRes.data ?? []) {
    const a = (row as { address_normalized?: string | null }).address_normalized
    if (a && counts[a]) counts[a].permits += 1
  }

  return NextResponse.json({ counts })
}
