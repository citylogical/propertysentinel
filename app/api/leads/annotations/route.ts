import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const LEAD_STATUSES = ['new', 'not_started', 'target', 'letter_sent', 'called', 'responded', 'converted'] as const

async function requireExploreUser(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data: subscriber } = await supabase.from('subscribers').select('role').eq('clerk_id', userId).single()
  if (!subscriber || !['admin', 'approved'].includes(subscriber.role as string)) {
    return false
  }
  return true
}

/** GET — all annotations for the current user, as map keyed by row_key */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!(await requireExploreUser(supabase, userId))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { data, error } = await supabase.from('lead_annotations').select('*').eq('user_id', userId)

  if (error) {
    console.error('[leads/annotations] GET:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const annotationMap: Record<string, Record<string, unknown>> = {}
  for (const row of data ?? []) {
    const key = (row as { row_key?: string }).row_key
    if (key) annotationMap[key] = row as Record<string, unknown>
  }

  return NextResponse.json({ annotations: annotationMap })
}

/** POST — upsert a single annotation */
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
    row_key?: string
    status?: string
    notes?: string | null
    flagged?: boolean
    flagged_count?: number
    maybe_count?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const row_key = body.row_key?.trim()
  if (!row_key) {
    return NextResponse.json({ error: 'Missing row_key' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('lead_annotations')
    .select('*')
    .eq('user_id', userId)
    .eq('row_key', row_key)
    .maybeSingle()

  const ext = existing as Record<string, unknown> | null

  const mergedStatus =
    body.status !== undefined ? body.status : (ext?.status as string | undefined) ?? 'not_started'
  if (!LEAD_STATUSES.includes(mergedStatus as (typeof LEAD_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const mergedNotes = body.notes !== undefined ? body.notes : (ext?.notes as string | null) ?? null
  const mergedFlagged = body.flagged !== undefined ? body.flagged : Boolean(ext?.flagged ?? false)

  const mergedFlaggedCount =
    body.flagged_count !== undefined
      ? body.flagged_count
      : typeof ext?.flagged_count === 'number'
        ? (ext.flagged_count as number)
        : 0

  const mergedMaybeCount =
    body.maybe_count !== undefined
      ? body.maybe_count
      : typeof ext?.maybe_count === 'number'
        ? (ext.maybe_count as number)
        : 0

  const now = new Date().toISOString()
  const payload = {
    user_id: userId,
    row_key,
    status: mergedStatus,
    notes: mergedNotes,
    flagged: mergedFlagged,
    flagged_count: mergedFlaggedCount,
    maybe_count: mergedMaybeCount,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('lead_annotations')
    .upsert(payload, { onConflict: 'user_id,row_key' })
    .select()
    .single()

  if (error) {
    console.error('[leads/annotations] POST:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ annotation: data })
}
