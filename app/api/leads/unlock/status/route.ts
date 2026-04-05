import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ unlocks: {} }, { status: 401 })
  }

  const srNumbersParam = req.nextUrl.searchParams.get('sr_numbers')
  if (!srNumbersParam) {
    return NextResponse.json({ unlocks: {} })
  }

  const srNumbers = srNumbersParam.split(',').map((s) => s.trim()).filter(Boolean)
  if (srNumbers.length === 0) {
    return NextResponse.json({ unlocks: {} })
  }

  const supabase = getSupabaseAdmin()
  const { data: unlocks } = await supabase.from('lead_unlocks').select('*').eq('user_id', userId).in('sr_number', srNumbers)

  const contactIds = [...new Set((unlocks ?? []).map((u) => (u as { tracerfy_contact_id?: string }).tracerfy_contact_id).filter(Boolean))] as string[]

  const contacts: Record<string, Record<string, unknown>> = {}
  if (contactIds.length > 0) {
    const { data: cacheRows } = await supabase.from('tracerfy_contact_cache').select('*').in('id', contactIds)
    for (const row of cacheRows ?? []) {
      const r = row as { id: string }
      contacts[r.id] = row as Record<string, unknown>
    }
  }

  const result: Record<string, { unlocked: boolean; unlock?: unknown; contact?: Record<string, unknown> }> = {}
  for (const sr of srNumbers) {
    const match = unlocks?.find((u) => (u as { sr_number: string }).sr_number === sr)
    if (match) {
      const u = match as { tracerfy_contact_id?: string | null }
      const contact = u.tracerfy_contact_id ? contacts[u.tracerfy_contact_id] : undefined
      result[sr] = { unlocked: true, unlock: match, contact }
    } else {
      result[sr] = { unlocked: false }
    }
  }

  return NextResponse.json({ unlocks: result })
}
