import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type MailingRow = {
  mailing_name: string | null
  mailing_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
}

/** All unlock rows for the current user, enriched with tax assessor mailing data. */
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

  // Enrich with tax assessor mailing data from the properties table.
  // Read-time join (Option B): works for existing unlocks without backfill,
  // and mailing data stays current when properties sell.
  const addresses = [
    ...new Set(
      (complaints ?? [])
        .map((c) => (c as { address_normalized?: string | null }).address_normalized)
        .filter((a): a is string => Boolean(a))
    ),
  ]
  const mailingByAddress = new Map<string, MailingRow>()
  if (addresses.length > 0) {
    const { data: props } = await supabase
      .from('properties')
      .select('address_normalized, mailing_name, mailing_address, mailing_city, mailing_state, mailing_zip')
      .in('address_normalized', addresses)
    for (const row of props ?? []) {
      const r = row as {
        address_normalized: string | null
        mailing_name: string | null
        mailing_address: string | null
        mailing_city: string | null
        mailing_state: string | null
        mailing_zip: string | null
      }
      if (r.address_normalized && !mailingByAddress.has(r.address_normalized)) {
        mailingByAddress.set(r.address_normalized, {
          mailing_name: r.mailing_name,
          mailing_address: r.mailing_address,
          mailing_city: r.mailing_city,
          mailing_state: r.mailing_state,
          mailing_zip: r.mailing_zip,
        })
      }
    }
  }

  const merged = list.map((u) => {
    const row = u as Record<string, unknown>
    const c = bySr.get(String(row.sr_number)) as Record<string, unknown> | undefined
    const base = { ...row, ...(c || {}) }
    const cid = base.tracerfy_contact_id as string | undefined
    const oe = base.owner_email as string | null | undefined
    const withEmail = oe ? base : cid && emailByCacheId.get(cid) ? { ...base, owner_email: emailByCacheId.get(cid) } : base
    const addr = withEmail.address_normalized as string | undefined
    const mailing = addr ? mailingByAddress.get(addr) : undefined
    if (!mailing) return withEmail
    return {
      ...withEmail,
      taxpayer_name: mailing.mailing_name,
      taxpayer_address: mailing.mailing_address,
      taxpayer_city: mailing.mailing_city,
      taxpayer_state: mailing.mailing_state,
      taxpayer_zip: mailing.mailing_zip,
    }
  })

  merged.sort((a, b) => {
    const ta = new Date(String((a as { created_at?: string }).created_at ?? 0)).getTime()
    const tb = new Date(String((b as { created_at?: string }).created_at ?? 0)).getTime()
    return tb - ta
  })

  return NextResponse.json({ unlocks: merged })
}
