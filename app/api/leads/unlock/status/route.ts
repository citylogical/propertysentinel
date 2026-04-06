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

  // Lookup taxpayer name from properties for each unlocked row's address.
  // We need address_normalized from complaints_311 for each sr_number.
  const unlockedSrs = (unlocks ?? []).map((u) => (u as { sr_number: string }).sr_number).filter(Boolean)
  const addrBySr = new Map<string, string>()
  if (unlockedSrs.length > 0) {
    const { data: complaints } = await supabase
      .from('complaints_311')
      .select('sr_number, address_normalized')
      .in('sr_number', unlockedSrs)
    for (const row of complaints ?? []) {
      const r = row as { sr_number: string; address_normalized: string | null }
      if (r.address_normalized) addrBySr.set(r.sr_number, r.address_normalized)
    }
  }
  const addresses = [...new Set([...addrBySr.values()])]
  const taxpayerByAddress = new Map<string, string>()
  if (addresses.length > 0) {
    const { data: props } = await supabase
      .from('properties')
      .select('address_normalized, mailing_name')
      .in('address_normalized', addresses)
    for (const row of props ?? []) {
      const r = row as { address_normalized: string | null; mailing_name: string | null }
      if (r.address_normalized && r.mailing_name && !taxpayerByAddress.has(r.address_normalized)) {
        taxpayerByAddress.set(r.address_normalized, r.mailing_name)
      }
    }
  }

  const result: Record<string, { unlocked: boolean; unlock?: unknown; contact?: Record<string, unknown>; taxpayer_name?: string | null }> = {}
  for (const sr of srNumbers) {
    const match = unlocks?.find((u) => (u as { sr_number: string }).sr_number === sr)
    if (match) {
      const u = match as { tracerfy_contact_id?: string | null }
      const contact = u.tracerfy_contact_id ? contacts[u.tracerfy_contact_id] : undefined
      const addr = addrBySr.get(sr)
      const taxpayer_name = addr ? taxpayerByAddress.get(addr) ?? null : null
      result[sr] = { unlocked: true, unlock: match, contact, taxpayer_name }
    } else {
      result[sr] = { unlocked: false }
    }
  }

  return NextResponse.json({ unlocks: result })
}
