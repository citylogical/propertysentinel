import { NextResponse } from 'next/server'
import { fetchPortfolioActivity } from '@/lib/portfolio-stats'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const auditSlugRaw = searchParams.get('slug')
  const propertyId = searchParams.get('property_id')

  if (!auditSlugRaw || !propertyId) {
    return NextResponse.json({ error: 'Missing slug or property_id' }, { status: 400 })
  }

  const auditSlug = auditSlugRaw.trim().toLowerCase()
  const supabase = getSupabaseAdmin()

  const { data: audit } = await supabase
    .from('portfolio_audits')
    .select('id, is_active, expires_at')
    .eq('slug', auditSlug)
    .maybeSingle()

  if (!audit || !audit.is_active) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
  }

  if (audit.expires_at && new Date(String(audit.expires_at)) < new Date()) {
    return NextResponse.json({ error: 'Audit expired' }, { status: 410 })
  }

  const { data: prop } = await supabase
    .from('portfolio_audit_properties')
    .select('*')
    .eq('audit_id', audit.id)
    .eq('id', propertyId)
    .maybeSingle()

  if (!prop) {
    return NextResponse.json({ error: 'Property not found in audit' }, { status: 404 })
  }

  const row = prop as {
    canonical_address?: string | null
    address_range?: string | null
    additional_streets?: string[] | null
  }

  const canonical = typeof row.canonical_address === 'string' ? row.canonical_address.trim() : ''
  if (!canonical) {
    return NextResponse.json({
      recent_complaints: [],
      recent_violations: [],
      recent_permits: [],
      latest_violation_date: null,
      latest_permit_date: null,
      str_registrations: 0,
      is_restricted_zone: false,
      nearby_listings: 0,
    })
  }

  const result = await fetchPortfolioActivity(
    supabase,
    canonical,
    row.address_range ?? null,
    row.additional_streets ?? null
  )

  const v0 = result.recent_violations[0] as { violation_date?: string | null } | undefined
  const p0 = result.recent_permits[0] as { issue_date?: string | null } | undefined

  return NextResponse.json({
    recent_complaints: result.recent_complaints,
    recent_violations: result.recent_violations,
    recent_permits: result.recent_permits,
    latest_violation_date: v0?.violation_date ?? null,
    latest_permit_date: p0?.issue_date ?? null,
    str_registrations: result.stats.str_registrations,
    is_restricted_zone: result.stats.is_restricted_zone,
    nearby_listings: result.stats.nearby_listings,
  })
}
