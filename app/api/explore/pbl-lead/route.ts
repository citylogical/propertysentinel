import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const LEAD_STATUSES = ['not_started', 'target', 'letter_sent', 'called', 'responded', 'converted'] as const

async function requireExploreUser(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data: subscriber } = await supabase.from('subscribers').select('role').eq('clerk_id', userId).single()
  if (!subscriber || !['admin', 'approved'].includes(subscriber.role as string)) {
    return false
  }
  return true
}

/** GET — all pbl_leads with application_id for client merge */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!(await requireExploreUser(supabase, userId))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { data: leads, error } = await supabase.from('pbl_leads').select('*').order('updated_at', { ascending: false })

  if (error) {
    console.error('[pbl-lead] GET:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = leads ?? []
  const pblIds = [...new Set(list.map((l) => l.pbl_id).filter(Boolean))] as string[]
  let idToApp = new Map<string, number | null>()

  if (pblIds.length > 0) {
    const { data: rows } = await supabase
      .from('pbl_intelligence_live')
      .select('id, application_id')
      .in('id', pblIds)

    for (const r of rows ?? []) {
      const row = r as { id?: string; application_id?: number | null }
      if (row.id) idToApp.set(row.id, row.application_id ?? null)
    }
  }

  const enriched = list.map((l) => ({
    ...l,
    application_id: idToApp.get(l.pbl_id as string) ?? null,
  }))

  return NextResponse.json({ leads: enriched })
}

/** POST — upsert lead row; reveal_contact returns mock BatchData for now */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!(await requireExploreUser(supabase, userId))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: {
    application_id?: number
    pbl_id?: string
    status?: string
    notes?: string | null
    reveal_contact?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let pblId = body.pbl_id?.trim() || ''
  const appId = body.application_id

  if (!pblId && appId != null && Number.isFinite(Number(appId))) {
    const { data: row } = await supabase
      .from('pbl_intelligence_live')
      .select('id')
      .eq('application_id', Number(appId))
      .maybeSingle()
    pblId = (row as { id?: string } | null)?.id ?? ''
  }

  if (!pblId) {
    return NextResponse.json({ error: 'Could not resolve PBL row (application_id / pbl_id)' }, { status: 400 })
  }

  if (body.status != null && !LEAD_STATUSES.includes(body.status as (typeof LEAD_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: existing } = await supabase.from('pbl_leads').select('*').eq('pbl_id', pblId).maybeSingle()
  const ex = existing as Record<string, unknown> | null

  const now = new Date().toISOString()
  let contact_name = (ex?.contact_name as string | null) ?? null
  let contact_phone = (ex?.contact_phone as string | null) ?? null
  let contact_email = (ex?.contact_email as string | null) ?? null
  let contact_revealed_at = (ex?.contact_revealed_at as string | null) ?? null

  if (body.reveal_contact) {
    contact_name = 'Sample Owner (mock)'
    contact_phone = '(312) 555-0100'
    contact_email = 'owner@example.com'
    contact_revealed_at = now
  }

  const row = {
    pbl_id: pblId,
    contact_name,
    contact_phone,
    contact_email,
    contact_revealed_at,
    status: (body.status ?? ex?.status ?? 'not_started') as string,
    notes: body.notes !== undefined ? body.notes : ((ex?.notes as string | null) ?? null),
    updated_by: userId,
    updated_at: now,
    created_at: (ex?.created_at as string) ?? now,
  }

  const { data: saved, error } = await supabase.from('pbl_leads').upsert(row, { onConflict: 'pbl_id' }).select('*').single()

  if (error) {
    console.error('[pbl-lead] POST upsert:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: appRow } = await supabase
    .from('pbl_intelligence_live')
    .select('application_id')
    .eq('id', pblId)
    .maybeSingle()

  return NextResponse.json({
    lead: {
      ...saved,
      application_id: (appRow as { application_id?: number } | null)?.application_id ?? appId ?? null,
    },
  })
}
