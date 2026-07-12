// app/api/dashboard/import/job/route.ts
//
// Owner-scoped read/edit of an import job.
//
// GET  ?job_id=…  → that job (any status)
// GET  (no id)    → the user's most recent job in 'review' — lets the review
//                   screen reload after close/reopen, queue-style
// PATCH           → persist review edits (unit_label / rent / included) into
//                   parsed_rows, keyed by row_num. Server re-sanitizes every
//                   field; only 'review'-status jobs are editable.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeCell, parseMoney } from '@/lib/rentroll/extract'
import type { ParsedUnitRow } from '@/lib/rentroll/types'

export const runtime = 'nodejs'

const JOB_COLS =
  'id, status, file_name, file_kind, parsed_rows, results, total_count, processed_count, failed_count, created_at'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId = (searchParams.get('job_id') ?? '').trim()
  const supabase = getSupabaseAdmin()

  if (jobId) {
    const { data: job, error } = await supabase
      .from('import_jobs')
      .select(JOB_COLS)
      .eq('id', jobId)
      .eq('clerk_id', userId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    return NextResponse.json({ job })
  }

  // Latest reviewable job — reopening the modal resumes where the user left
  // off. Committed jobs stay reachable so the queue can link back to the
  // review; re-committing after edits is idempotent.
  const { data: latest, error: latestErr } = await supabase
    .from('import_jobs')
    .select(JOB_COLS)
    .eq('clerk_id', userId)
    .in('status', ['review', 'committed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500 })
  return NextResponse.json({ job: latest ?? null })
}

type RowUpdate = {
  row_num?: number
  unit_label?: unknown
  rent?: unknown
  included?: unknown
}

export async function PATCH(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { job_id?: string; updates?: RowUpdate[] }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const jobId = (body.job_id ?? '').trim()
  const updates = Array.isArray(body.updates) ? body.updates.slice(0, 200) : []
  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
  if (updates.length === 0) return NextResponse.json({ ok: true, updated: 0 })

  const supabase = getSupabaseAdmin()
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, status, parsed_rows')
    .eq('id', jobId)
    .eq('clerk_id', userId)
    .maybeSingle()
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const j = job as { id: string; status: string; parsed_rows: ParsedUnitRow[] }
  if (j.status !== 'review' && j.status !== 'committed') {
    return NextResponse.json({ error: 'Job is not in review' }, { status: 409 })
  }

  const rows = Array.isArray(j.parsed_rows) ? j.parsed_rows : []
  const byRowNum = new Map<number, ParsedUnitRow>()
  for (const r of rows) byRowNum.set(r.row_num, r)

  let updated = 0
  for (const u of updates) {
    if (typeof u.row_num !== 'number') continue
    const row = byRowNum.get(u.row_num)
    if (!row) continue
    if ('unit_label' in u) row.unit_label = sanitizeCell(u.unit_label).slice(0, 60) || null
    if ('rent' in u) {
      row.rent = u.rent === null ? null : parseMoney(sanitizeCell(u.rent))
    }
    if ('included' in u && typeof u.included === 'boolean') row.included = u.included
    updated++
  }

  const { error: updateErr } = await supabase
    .from('import_jobs')
    .update({ parsed_rows: rows, updated_at: new Date().toISOString() })
    .eq('id', j.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated })
}
