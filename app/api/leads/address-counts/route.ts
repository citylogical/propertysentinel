import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { addresses?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const addresses = body.addresses
  if (!addresses || addresses.length === 0) {
    return NextResponse.json({ counts: {} as Record<string, { complaints: number; violations: number; permits: number }> })
  }

  const supabase = getSupabaseAdmin()
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const since = oneYearAgo.toISOString().slice(0, 19)

  const counts: Record<string, { complaints: number; violations: number; permits: number }> = {}

  for (const addr of addresses) {
    if (!addr) continue
    const [complaintsRes, violationsRes, permitsRes] = await Promise.all([
      supabase
        .from('complaints_311')
        .select('sr_number', { count: 'exact', head: true })
        .eq('address_normalized', addr)
        .gte('created_date', since),
      supabase
        .from('violations')
        .select('violation_date', { count: 'exact', head: true })
        .eq('address_normalized', addr)
        .gte('violation_date', since),
      supabase
        .from('permits')
        .select('issue_date', { count: 'exact', head: true })
        .eq('address_normalized', addr)
        .gte('issue_date', since),
    ])

    counts[addr] = {
      complaints: complaintsRes.count ?? 0,
      violations: violationsRes.count ?? 0,
      permits: permitsRes.count ?? 0,
    }
  }

  return NextResponse.json({ counts })
}
