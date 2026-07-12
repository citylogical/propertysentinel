// app/api/dashboard/import/job/route.ts
//
// Owner-scoped read of an import job — the review screen loads parsed_rows +
// results from here once /import/process flips the job to 'review'.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId = (searchParams.get('job_id') ?? '').trim()
  if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: job, error } = await supabase
    .from('import_jobs')
    .select('id, status, file_name, file_kind, parsed_rows, results, total_count, processed_count, failed_count, created_at')
    .eq('id', jobId)
    .eq('clerk_id', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  return NextResponse.json({ job })
}
