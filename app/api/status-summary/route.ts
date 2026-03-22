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

  const { data, error } = await supabase
    .from('worker_a_runs')
    .select('status, ran_at')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json({ status: 'operational', lastRanAt: null })
  }

  return NextResponse.json({
    status: data.status === 'failure' ? 'degraded' : 'operational',
    lastRanAt: data.ran_at,
  })
}