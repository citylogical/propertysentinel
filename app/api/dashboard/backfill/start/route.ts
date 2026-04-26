import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAllAddresses } from '@/lib/portfolio-stats'
import { ENRICHABLE_SR_CODES } from '@/lib/aura-enrich'

export const runtime = 'nodejs'
export const maxDuration = 30

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

  let body: { property_ids?: string[] }
  try {
    body = (await request.json()) as { property_ids?: string[] }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const propertyIds = (body.property_ids ?? []).filter((s) => typeof s === 'string' && s.trim() !== '')
  if (propertyIds.length === 0) {
    return NextResponse.json({ error: 'No property_ids provided' }, { status: 400 })
  }

  // Fetch the selected portfolio properties
  const { data: props, error: propsErr } = await supabase
    .from('portfolio_properties')
    .select('id, canonical_address, address_range, additional_streets')
    .in('id', propertyIds)
    .eq('user_id', user.id)

  if (propsErr) {
    return NextResponse.json({ error: propsErr.message }, { status: 500 })
  }
  if (!props || props.length === 0) {
    return NextResponse.json({ error: 'No matching properties found' }, { status: 404 })
  }

  // Expand all property addresses into a flat list of normalized addresses
  const allAddresses = new Set<string>()
  for (const p of props) {
    const row = p as {
      canonical_address: string
      address_range: string | null
      additional_streets: string[] | null
    }
    for (const addr of getAllAddresses(row.canonical_address, row.address_range, row.additional_streets)) {
      allAddresses.add(addr)
    }
  }

  if (allAddresses.size === 0) {
    return NextResponse.json({ error: 'No addresses to enrich' }, { status: 400 })
  }

  // Find unenriched, enrichable complaints in the last 12 months for these addresses
  const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString()
  const { data: complaints, error: complaintsErr } = await supabase
    .from('complaints_311')
    .select('id, sr_number, sr_short_code, sr_type')
    .in('address_normalized', Array.from(allAddresses))
    .in('sr_short_code', ENRICHABLE_SR_CODES as unknown as string[])
    .gte('created_date', twelveMonthsAgo)
    .is('enriched_at', null)
    .order('created_date', { ascending: false })
    .limit(2000)

  if (complaintsErr) {
    return NextResponse.json({ error: complaintsErr.message }, { status: 500 })
  }

  const queue = (complaints ?? []).map((c) => {
    const row = c as {
      id: string
      sr_number: string
      sr_short_code: string | null
      sr_type: string | null
    }
    return {
      id: row.id,
      sr_number: row.sr_number,
      sr_short_code: row.sr_short_code ?? '',
      sr_type: row.sr_type ?? null,
    }
  })

  if (queue.length === 0) {
    return NextResponse.json({
      job_id: null,
      total: 0,
      processed: 0,
      failed: 0,
      status: 'done',
      message: 'No unenriched complaints found for the selected properties.',
    })
  }

  const { data: job, error: jobErr } = await supabase
    .from('backfill_jobs')
    .insert({
      created_by: user.id,
      property_ids: propertyIds,
      complaint_queue: queue,
      total_count: queue.length,
      processed_count: 0,
      failed_count: 0,
      status: 'pending',
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500 })
  }

  return NextResponse.json({
    job_id: (job as { id: string }).id,
    total: queue.length,
    processed: 0,
    failed: 0,
    status: 'pending',
  })
}
