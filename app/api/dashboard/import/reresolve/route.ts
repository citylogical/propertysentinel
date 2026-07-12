// app/api/dashboard/import/reresolve/route.ts
//
// Review-screen action: the user fixed an address we couldn't match
// ("235 Van Buren" → "235 W Van Buren St") — resolve the corrected address
// and store the result on the job so the row can flip amber → green. The
// result is keyed by the corrected string (raw_address), replacing any prior
// attempt at the same string.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveImportAddress, type ImportResolution } from '@/lib/rentroll/resolve'
import { sanitizeCell } from '@/lib/rentroll/extract'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { job_id?: string; address?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const jobId = (body.job_id ?? '').trim()
  const address = sanitizeCell(body.address)
  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
  if (!address || address.length < 4) {
    return NextResponse.json({ error: 'Enter an address to check' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, results, status')
    .eq('id', jobId)
    .eq('clerk_id', userId)
    .maybeSingle()

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const j = job as { id: string; results: ImportResolution[]; status: string }
  if (j.status !== 'review') {
    return NextResponse.json({ error: 'Job is not in review' }, { status: 409 })
  }

  const resolution = await resolveImportAddress(address)

  const results = (Array.isArray(j.results) ? j.results : []).filter(
    (r) => r.raw_address !== address
  )
  results.push(resolution)

  const { error: updateErr } = await supabase
    .from('import_jobs')
    .update({ results, updated_at: new Date().toISOString() })
    .eq('id', j.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ resolution })
}
