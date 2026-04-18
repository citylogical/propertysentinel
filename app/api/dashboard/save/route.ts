import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizePinSilent } from '@/lib/supabase-search'

async function resolveIsPbl(supabase: ReturnType<typeof getSupabaseAdmin>, pinsRaw: string[]): Promise<boolean> {
  const uniq = new Set<string>()
  for (const p of pinsRaw) {
    const n = normalizePinSilent(String(p).trim())
    if (!n) continue
    uniq.add(n)
    uniq.add(n.replace(/-/g, ''))
  }
  const list = [...uniq]
  if (!list.length) return false
  const { data } = await supabase.from('str_prohibited_buildings').select('pin').in('pin', list)
  return !!data?.length
}

function parseNonNegInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v))
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseInt(v.replace(/,/g, ''), 10)
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  return fallback
}

function parseBool(v: unknown): boolean {
  return v === true
}

function parseImpliedValue(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

function parseYearBuilt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  const s = String(v).trim()
  if (!s) return null
  const n = parseInt(s.replace(/\D/g, '').slice(0, 4), 10)
  return n >= 1600 && n <= 2100 ? n : null
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ saved: false })
  }

  const { searchParams } = new URL(request.url)
  const canonicalAddress = searchParams.get('canonical_address')

  if (!canonicalAddress) {
    return NextResponse.json({ saved: false })
  }

  const supabase = getSupabaseAdmin()

  const { data } = await supabase
    .from('portfolio_properties')
    .select('id, display_name, alerts_enabled')
    .eq('user_id', userId)
    .eq('canonical_address', canonicalAddress)
    .maybeSingle()

  return NextResponse.json({
    saved: !!data,
    portfolio_id: data?.id ?? null,
    display_name: data?.display_name ?? null,
    alerts_enabled: data?.alerts_enabled ?? false,
  })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const canonical_address =
    typeof body.canonical_address === 'string' ? body.canonical_address.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const display_name_raw = typeof body.display_name === 'string' ? body.display_name : ''

  if (!canonical_address || !slug) {
    return NextResponse.json(
      { error: 'Missing required fields: canonical_address and slug' },
      { status: 400 }
    )
  }

  if (!display_name_raw.trim()) {
    return NextResponse.json({ error: 'Property name is required' }, { status: 400 })
  }

  const address_range =
    typeof body.address_range === 'string' && body.address_range.trim() !== ''
      ? body.address_range.trim()
      : null

  const additional_streets = Array.isArray(body.additional_streets)
    ? body.additional_streets
        .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        .map((s) => s.trim())
    : []

  const pins = Array.isArray(body.pins)
    ? body.pins.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
    : []

  const parseOptInt = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10)
    return Number.isFinite(n) ? n : null
  }

  const units_override = parseOptInt(body.units_override)
  const sqft_override = parseOptInt(body.sqft_override)

  const notes =
    typeof body.notes === 'string' && body.notes.trim() !== '' ? body.notes.trim() : null

  const alerts_enabled = body.alerts_enabled === true
  const alert_email = alerts_enabled
  const alert_sms = false

  const open_complaints = parseNonNegInt(body.open_complaints, 0)
  const total_complaints_12mo = parseNonNegInt(body.total_complaints_12mo, 0)
  const open_violations = parseNonNegInt(body.open_violations, 0)
  const total_violations_12mo = parseNonNegInt(body.total_violations_12mo, 0)
  const total_permits_12mo = parseNonNegInt(body.total_permits_12mo, 0)
  const shvr_count = parseNonNegInt(body.shvr_count, 0)
  const has_stop_work = parseBool(body.has_stop_work)
  const implied_value = parseImpliedValue(body.implied_value)
  const property_class =
    typeof body.property_class === 'string' && body.property_class.trim() !== ''
      ? body.property_class.trim()
      : null
  const community_area =
    typeof body.community_area === 'string' && body.community_area.trim() !== ''
      ? body.community_area.trim()
      : null
  const year_built = parseYearBuilt(body.year_built)
  const stats_updated_at =
    typeof body.stats_updated_at === 'string' && body.stats_updated_at.trim() !== ''
      ? body.stats_updated_at.trim()
      : new Date().toISOString()

  const supabase = getSupabaseAdmin()
  const is_pbl = await resolveIsPbl(supabase, pins)

  const { data, error } = await supabase
    .from('portfolio_properties')
    .upsert(
      {
        user_id: userId,
        canonical_address,
        address_range,
        additional_streets: additional_streets.length > 0 ? additional_streets : null,
        pins: pins.length > 0 ? pins : null,
        slug,
        display_name: display_name_raw.trim(),
        units_override,
        sqft_override,
        notes,
        alerts_enabled,
        alert_email,
        alert_sms,
        updated_at: new Date().toISOString(),
        open_complaints,
        total_complaints_12mo,
        open_violations,
        total_violations_12mo,
        total_permits_12mo,
        shvr_count,
        is_pbl,
        has_stop_work,
        implied_value,
        property_class,
        year_built,
        community_area,
        stats_updated_at,
      },
      { onConflict: 'user_id,canonical_address' }
    )
    .select()
    .single()

  if (error) {
    console.error('Portfolio save error:', error)
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This property is already in your dashboard' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id })
}
