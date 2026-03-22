// app/api/status-summary/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getSupabaseAdmin()

  const [runResult, modResult] = await Promise.all([
    supabase
      .from('worker_a_runs')
      .select('status, ran_at')
      .order('ran_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('complaints_311')
      .select('last_modified_date')
      .order('last_modified_date', { ascending: false })
      .limit(1)
      .single(),
  ])

  return NextResponse.json({
    status: runResult.data?.status === 'failure' ? 'degraded' : 'operational',
    lastRanAt: runResult.data?.ran_at ?? null,
    // Socrata CT-local time stored with false +00:00 — slice to 19 chars for correct display
    mostRecentModified: modResult.data?.last_modified_date
      ? modResult.data.last_modified_date.slice(0, 19)
      : null,
  })
}