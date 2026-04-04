import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { sr_numbers?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sr_numbers = body.sr_numbers
  if (!sr_numbers || sr_numbers.length === 0) {
    return NextResponse.json({ counts: {} as Record<string, number> })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('lead_unlock_counts').select('sr_number, unlock_count').in('sr_number', sr_numbers)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const r = row as { sr_number: string; unlock_count: number }
    counts[r.sr_number] = r.unlock_count ?? 0
  }

  return NextResponse.json({ counts })
}
