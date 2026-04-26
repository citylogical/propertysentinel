import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchAuraEnrichment } from '@/lib/aura-enrich'
import { paraphraseComplaint } from '@/lib/paraphrase-complaint'

export const runtime = 'nodejs'
export const maxDuration = 60

const CHUNK_SIZE = 6 // ~36-42s of work per request, well under 60s timeout

type QueueItem = {
  id: string
  sr_number: string
  sr_short_code: string
  sr_type: string | null
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', user.id)
    .maybeSingle()
  const role = (subscriber as { role?: string | null } | null)?.role
  if (!subscriber || role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { job_id?: string }
  try {
    body = (await request.json()) as { job_id?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const jobId = (body.job_id ?? '').trim()
  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })

  const { data: job, error: jobErr } = await supabase
    .from('backfill_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('created_by', user.id)
    .maybeSingle()

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const j = job as {
    id: string
    complaint_queue: QueueItem[]
    total_count: number
    processed_count: number
    failed_count: number
    status: string
  }

  if (j.status === 'done') {
    return NextResponse.json({
      job_id: j.id,
      total: j.total_count,
      processed: j.processed_count,
      failed: j.failed_count,
      status: 'done',
    })
  }

  // Mark as running on first chunk
  if (j.status === 'pending') {
    await supabase
      .from('backfill_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', j.id)
  }

  const queue = Array.isArray(j.complaint_queue) ? j.complaint_queue : []
  const chunk = queue.slice(0, CHUNK_SIZE)
  const remaining = queue.slice(CHUNK_SIZE)

  let processed = j.processed_count
  let failed = j.failed_count

  for (const item of chunk) {
    try {
      const aura = await fetchAuraEnrichment(item.sr_number)

      // Always set enriched_at on attempt — prevents infinite retry on bad records.
      const dbUpdate: Record<string, unknown> = {
        enriched_at: new Date().toISOString(),
      }
      if (aura.caseId) dbUpdate.salesforce_case_id = aura.caseId
      for (const [k, v] of Object.entries(aura.fields)) {
        dbUpdate[k] = v
      }

      await supabase.from('complaints_311').update(dbUpdate as Record<string, unknown>).eq('id', item.id)

      // Paraphrase only when we got a real description
      const description = aura.fields.complaint_description as string | undefined
      if (description) {
        const paraphrase = await paraphraseComplaint({
          sr_short_code: item.sr_short_code,
          sr_type: item.sr_type,
          description,
          complainant_type: aura.fields.complainant_type as string | undefined,
          unit_number: aura.fields.unit_number as string | undefined,
          danger_reported: aura.fields.danger_reported as string | undefined,
          owner_notified: aura.fields.owner_notified as string | undefined,
          owner_occupied: aura.fields.owner_occupied as string | undefined,
          concern_category: aura.fields.concern_category as string | undefined,
          restaurant_name: aura.fields.restaurant_name as string | undefined,
          business_name: aura.fields.business_name as string | undefined,
          problem_category: aura.fields.problem_category as string | undefined,
        })

        if (paraphrase) {
          await supabase
            .from('complaints_311')
            .update({
              standard_description: paraphrase.standard_description,
              trade_category: paraphrase.trade_category,
              urgency_tier: paraphrase.urgency_tier,
              paraphrased_at: new Date().toISOString(),
            })
            .eq('id', item.id)
        }
      }

      processed += 1
      if (!aura.caseId) failed += 1
    } catch (err) {
      console.error(`[backfill] ${item.sr_number} unexpected error:`, err)
      processed += 1
      failed += 1
      // Best-effort: still mark enriched_at so we don't keep retrying
      try {
        await supabase
          .from('complaints_311')
          .update({ enriched_at: new Date().toISOString() })
          .eq('id', item.id)
      } catch {
        /* swallow */
      }
    }
  }

  const isDone = remaining.length === 0
  const updatePayload: Record<string, unknown> = {
    complaint_queue: remaining,
    processed_count: processed,
    failed_count: failed,
    updated_at: new Date().toISOString(),
  }
  if (isDone) {
    updatePayload.status = 'done'
    updatePayload.completed_at = new Date().toISOString()
  }

  await supabase.from('backfill_jobs').update(updatePayload as Record<string, unknown>).eq('id', j.id)

  return NextResponse.json({
    job_id: j.id,
    total: j.total_count,
    processed,
    failed,
    status: isDone ? 'done' : 'running',
  })
}
