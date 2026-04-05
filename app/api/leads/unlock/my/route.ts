import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

/** All unlock rows for the current user (for Unlocked tab hydration). */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ unlocks: [] }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data: unlocks, error } = await supabase.from('lead_unlocks').select('*').eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const list = unlocks ?? []
  const srs = list.map((u) => (u as { sr_number: string }).sr_number).filter(Boolean)
  if (srs.length === 0) return NextResponse.json({ unlocks: [] })

  const { data: complaints } = await supabase
    .from('complaints_311')
    .select('sr_number, sr_type, sr_short_code, created_date, community_area, address_normalized')
    .in('sr_number', srs)

  const bySr = new Map((complaints ?? []).map((c) => [(c as { sr_number: string }).sr_number, c]))

  const contactIds = [
    ...new Set(
      list
        .map((u) => (u as { tracerfy_contact_id?: string | null }).tracerfy_contact_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const emailByCacheId = new Map<string, string>()
  if (contactIds.length > 0) {
    const { data: caches } = await supabase
      .from('tracerfy_contact_cache')
      .select('id, primary_email')
      .in('id', contactIds)
    for (const row of caches ?? []) {
      const r = row as { id: string; primary_email: string | null }
      if (r.primary_email) emailByCacheId.set(r.id, r.primary_email)
    }
  }

  const merged = list.map((u) => {
    const row = u as Record<string, unknown>
    const c = bySr.get(String(row.sr_number)) as Record<string, unknown> | undefined
    const base = { ...row, ...(c || {}) }
    const cid = base.tracerfy_contact_id as string | undefined
    const oe = base.owner_email as string | null | undefined
    if (oe) return base
    const pe = cid ? emailByCacheId.get(cid) : undefined
    return pe ? { ...base, owner_email: pe } : base
  })

  merged.sort((a, b) => {
    const ta = new Date(String((a as { created_at?: string }).created_at ?? 0)).getTime()
    const tb = new Date(String((b as { created_at?: string }).created_at ?? 0)).getTime()
    return tb - ta
  })

  return NextResponse.json({ unlocks: merged })
}
