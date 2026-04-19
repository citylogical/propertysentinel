import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function isSubscriberAdmin(subscriber: Record<string, unknown> | null | undefined): boolean {
  if (!subscriber) return false
  if (subscriber.is_admin === true) return true
  const role = subscriber.role != null ? String(subscriber.role) : ''
  return role === 'admin'
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase.from('subscribers').select('*').eq('clerk_id', userId).maybeSingle()

  if (!isSubscriberAdmin(subscriber as Record<string, unknown> | null)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const slug =
    typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : ''
  if (!slug) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
  }

  const property_ids = (
    Array.isArray(body.property_ids)
      ? body.property_ids.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      : []
  ) as string[]
  if (property_ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one property' }, { status: 400 })
  }

  const { data: existing } = await supabase.from('portfolio_audits').select('id').eq('slug', slug).maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This slug is already taken' }, { status: 409 })
  }

  let expires_at: string | null
  if (body.expires_days === null) {
    expires_at = null
  } else {
    const expires_days =
      body.expires_days !== undefined && body.expires_days !== ''
        ? Number(body.expires_days)
        : 14
    expires_at =
      Number.isFinite(expires_days) && expires_days > 0
        ? new Date(Date.now() + expires_days * 86400000).toISOString()
        : null
  }

  const { data: audit, error: auditErr } = await supabase
    .from('portfolio_audits')
    .insert({
      created_by: userId,
      slug,
      pm_company_name: typeof body.pm_company_name === 'string' ? body.pm_company_name.trim() || null : null,
      contact_email: typeof body.contact_email === 'string' ? body.contact_email.trim() || null : null,
      internal_notes: typeof body.internal_notes === 'string' ? body.internal_notes.trim() || null : null,
      expires_at,
      is_active: true,
    })
    .select('id')
    .single()

  if (auditErr || !audit) {
    console.error('[audit/create] header insert', auditErr?.message)
    return NextResponse.json({ error: auditErr?.message || 'Failed to create audit' }, { status: 500 })
  }

  const { data: props } = await supabase
    .from('portfolio_properties')
    .select('*')
    .in('id', property_ids)
    .eq('user_id', userId)

  if (!props || props.length === 0) {
    await supabase.from('portfolio_audits').delete().eq('id', audit.id as string)
    return NextResponse.json({ error: 'No matching properties found' }, { status: 400 })
  }

  const auditProperties = props.map((p: Record<string, unknown>) => ({
    audit_id: audit.id,
    portfolio_property_id: p.id,
    canonical_address: p.canonical_address,
    address_range: p.address_range,
    additional_streets: p.additional_streets,
    display_name: p.display_name,
    pins: p.pins,
    slug: p.slug,
    community_area: p.community_area,
    property_class: p.property_class,
    year_built: p.year_built,
    implied_value: p.implied_value,
    open_complaints: p.open_complaints ?? 0,
    total_complaints_12mo: p.total_complaints_12mo ?? 0,
    open_violations: p.open_violations ?? 0,
    total_violations_12mo: p.total_violations_12mo ?? 0,
    total_permits_12mo: p.total_permits_12mo ?? 0,
    shvr_count: p.shvr_count ?? 0,
    is_pbl: p.is_pbl ?? false,
    has_stop_work: p.has_stop_work ?? false,
    str_registrations: p.str_registrations ?? 0,
    is_restricted_zone: p.is_restricted_zone ?? false,
    nearby_listings: p.nearby_listings ?? 0,
  }))

  const { error: propsErr } = await supabase.from('portfolio_audit_properties').insert(auditProperties)

  if (propsErr) {
    console.error('[audit/create] snapshot insert', propsErr.message)
    await supabase.from('portfolio_audits').delete().eq('id', audit.id as string)
    return NextResponse.json({ error: propsErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    audit_id: audit.id,
    slug,
    url: `/audit/${slug}`,
  })
}
