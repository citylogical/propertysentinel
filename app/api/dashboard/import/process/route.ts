// app/api/dashboard/import/process/route.ts
//
// Rent-roll upload, step 2: resolve one chunk of addresses per call through
// the production resolution stack (lib/rentroll/resolve.ts), moving them from
// import_jobs.resolve_queue into import_jobs.results. The browser re-POSTs
// while status is 'resolving' — same client-driven loop as
// /api/dashboard/backfill/process. When the queue drains the job flips to
// 'review' and the review screen renders from parsed_rows + results.
//
// Resolution is DB-read-only (~10-15 PostgREST queries per address, ~1-1.5s);
// the only write is the job row itself. Single writer per job (the owner's
// browser loop), so read-modify-write on the JSONB queue is safe.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveImportAddress, type ImportResolution } from '@/lib/rentroll/resolve'

export const runtime = 'nodejs'
export const maxDuration = 60

const CHUNK_SIZE = 15 // ~1-1.5s per address, ~20-25s per chunk, well under 60s

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { job_id?: string }
  try {
    body = (await request.json()) as { job_id?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const jobId = (body.job_id ?? '').trim()
  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, resolve_queue, results, total_count, processed_count, failed_count, status')
    .eq('id', jobId)
    .eq('clerk_id', userId)
    .maybeSingle()

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const j = job as {
    id: string
    resolve_queue: string[]
    results: ImportResolution[]
    total_count: number
    processed_count: number
    failed_count: number
    status: string
  }

  if (j.status !== 'pending' && j.status !== 'resolving') {
    return NextResponse.json({
      job_id: j.id,
      total: j.total_count,
      processed: j.processed_count,
      failed: j.failed_count,
      status: j.status,
    })
  }

  if (j.status === 'pending') {
    await supabase
      .from('import_jobs')
      .update({ status: 'resolving', updated_at: new Date().toISOString() })
      .eq('id', j.id)
  }

  const queue = Array.isArray(j.resolve_queue) ? j.resolve_queue : []
  const chunk = queue.slice(0, CHUNK_SIZE)
  const remaining = queue.slice(CHUNK_SIZE)

  const newResults: ImportResolution[] = []
  let failed = j.failed_count

  for (const address of chunk) {
    const resolution = await resolveImportAddress(address)
    newResults.push(resolution)
    if (resolution.match === 'no_match' || resolution.error) failed += 1
  }

  const processed = j.processed_count + chunk.length
  const isDone = remaining.length === 0
  const updatePayload: Record<string, unknown> = {
    resolve_queue: remaining,
    results: [...(Array.isArray(j.results) ? j.results : []), ...newResults],
    processed_count: processed,
    failed_count: failed,
    updated_at: new Date().toISOString(),
  }
  if (isDone) updatePayload.status = 'review'

  const { error: updateErr } = await supabase
    .from('import_jobs')
    .update(updatePayload)
    .eq('id', j.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    job_id: j.id,
    total: j.total_count,
    processed,
    failed,
    status: isDone ? 'review' : 'resolving',
  })
}
