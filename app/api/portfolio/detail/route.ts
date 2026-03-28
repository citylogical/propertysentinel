import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizePinSilent } from '@/lib/supabase-search'

function normalizePinList(pins: string[] | null | undefined): string[] {
  if (!pins?.length) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of pins) {
    const n = normalizePinSilent(String(p).trim())
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('id')
  if (!propertyId) {
    return NextResponse.json({ error: 'Missing property id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: prop, error: propErr } = await supabase
    .from('portfolio_properties')
    .select('*')
    .eq('id', propertyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (propErr || !prop) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const addresses: string[] = []
  const c = (prop as { canonical_address?: string | null }).canonical_address?.trim()
  if (c) addresses.push(c)

  const pins = normalizePinList((prop as { pins?: string[] | null }).pins ?? null)
  if (pins.length > 0) {
    const { data: pinRows } = await supabase.from('properties').select('address_normalized').in('pin', pins)

    for (const r of pinRows ?? []) {
      const row = r as { address_normalized?: string | null }
      const a = row.address_normalized?.trim()
      if (a && !addresses.includes(a)) addresses.push(a)
    }
  }

  if (addresses.length === 0) {
    return NextResponse.json({
      recent_complaints: [],
      recent_violations: [],
      recent_permits: [],
      latest_violation_date: null,
      latest_permit_date: null,
    })
  }

  const [recentComplaints, recentViolations, recentPermits, latestViolation, latestPermit] = await Promise.all([
    supabase
      .from('complaints_311')
      .select('sr_type, created_date, sr_number, status')
      .in('address_normalized', addresses)
      .order('created_date', { ascending: false })
      .limit(5),

    supabase
      .from('violations')
      .select(
        'violation_description, violation_date, violation_status, inspection_category, department_bureau, inspection_status'
      )
      .in('address_normalized', addresses)
      .order('violation_date', { ascending: false })
      .limit(5),

    supabase
      .from('permits')
      .select('permit_type, work_description, issue_date, reported_cost, total_fee')
      .in('address_normalized', addresses)
      .order('issue_date', { ascending: false })
      .limit(5),

    supabase
      .from('violations')
      .select('violation_date')
      .in('address_normalized', addresses)
      .order('violation_date', { ascending: false })
      .limit(1),

    supabase
      .from('permits')
      .select('issue_date')
      .in('address_normalized', addresses)
      .order('issue_date', { ascending: false })
      .limit(1),
  ])

  const lvRows = latestViolation.data as { violation_date?: string | null }[] | null
  const lpRows = latestPermit.data as { issue_date?: string | null }[] | null

  return NextResponse.json({
    recent_complaints: recentComplaints.data ?? [],
    recent_violations: recentViolations.data ?? [],
    recent_permits: recentPermits.data ?? [],
    latest_violation_date: lvRows?.[0]?.violation_date ?? null,
    latest_permit_date: lpRows?.[0]?.issue_date ?? null,
  })
}
