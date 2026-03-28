import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizePinSilent } from '@/lib/supabase-search'

type PortfolioRow = Record<string, unknown> & {
  id: string
  canonical_address: string
  address_range: string | null
  additional_streets: string[] | null
  pins: string[] | null
  slug: string
  display_name: string | null
  units_override: number | null
  sqft_override: number | null
  notes: string | null
  alerts_enabled: boolean
  created_at: string
}

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

async function impliedValueForPins(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  pins: string[]
): Promise<number | null> {
  if (!pins.length) return null
  const perPin = await Promise.all(
    pins.map(async (pin) => {
      const { data: rows } = await supabase
        .from('assessed_values')
        .select('board_tot, certified_tot, mailed_tot, tax_year')
        .eq('pin', pin)
        .order('tax_year', { ascending: false })
        .limit(8)

      const row = (rows ?? []).find(
        (r: { board_tot?: unknown; certified_tot?: unknown; mailed_tot?: unknown }) =>
          r.board_tot != null || r.certified_tot != null || r.mailed_tot != null
      ) as { board_tot?: number | null; certified_tot?: number | null; mailed_tot?: number | null } | undefined

      if (!row) return null
      const v = Number(row.board_tot ?? row.certified_tot ?? row.mailed_tot)
      return Number.isFinite(v) ? v : null
    })
  )
  let sum = 0
  let any = false
  for (const v of perPin) {
    if (v != null) {
      sum += v
      any = true
    }
  }
  return any ? sum * 10 : null
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: properties, error } = await supabase
    .from('portfolio_properties')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Portfolio list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!properties?.length) {
    return NextResponse.json({ properties: [] })
  }

  const enriched = await Promise.all(
    (properties as PortfolioRow[]).map(async (prop) => {
      const addresses: string[] = []
      const addAddr = (a: string | null | undefined) => {
        const t = a?.trim()
        if (t && !addresses.includes(t)) addresses.push(t)
      }

      addAddr(prop.canonical_address)

      const normPins = normalizePinList(prop.pins ?? null)

      const pinAddressesPromise =
        normPins.length > 0
          ? supabase.from('properties').select('address_normalized').in('pin', normPins)
          : Promise.resolve({ data: [] as { address_normalized?: string | null }[] })

      const [pinAddrRes, pblRes, charsRes, propRowRes, parcelRes, impliedValue] = await Promise.all([
        pinAddressesPromise,
        normPins.length > 0
          ? supabase.from('str_prohibited_buildings').select('*', { count: 'exact', head: true }).in('pin', normPins)
          : Promise.resolve({ count: 0 }),
        normPins.length > 0
          ? supabase
              .from('property_chars_residential')
              .select(
                'year_built, building_sqft, num_apartments, type_of_residence, construction_quality, ext_wall_material, roof_material, repair_condition'
              )
              .eq('pin', normPins[0]!)
              .order('tax_year', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        normPins.length > 0
          ? supabase.from('properties').select('property_class').eq('pin', normPins[0]!).maybeSingle()
          : Promise.resolve({ data: null }),
        normPins.length > 0
          ? supabase
              .from('parcel_universe')
              .select('community_area_name')
              .eq('pin', normPins[0]!)
              .order('tax_year', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        impliedValueForPins(supabase, normPins),
      ])

      for (const pa of pinAddrRes.data ?? []) {
        const row = pa as { address_normalized?: string | null }
        addAddr(row.address_normalized ?? undefined)
      }

      const hasAddr = addresses.length > 0
      const isPbl = (pblRes.count ?? 0) > 0
      const buildingChars = (charsRes.data as Record<string, unknown> | null) ?? null
      const classInfo =
        (propRowRes.data as { property_class?: string | null } | null)?.property_class ?? null
      const communityArea =
        (parcelRes.data as { community_area_name?: string | null } | null)?.community_area_name ?? null

      const openViolQ = hasAddr
        ? supabase
            .from('violations')
            .select('*', { count: 'exact', head: true })
            .in('address_normalized', addresses)
            .or(
              'violation_status.eq.OPEN,violation_status.eq.FAILED,violation_status.eq.Open,violation_status.eq.Failed,inspection_status.eq.OPEN,inspection_status.eq.FAILED,inspection_status.eq.Open,inspection_status.eq.Failed'
            )
        : Promise.resolve({ count: 0 })

      const openComplaintsQ = hasAddr
        ? supabase
            .from('complaints_311')
            .select('*', { count: 'exact', head: true })
            .in('address_normalized', addresses)
            .in('status', ['Open', 'OPEN', 'open'])
        : Promise.resolve({ count: 0 })

      const totalPermitsQ = hasAddr
        ? supabase
            .from('permits')
            .select('*', { count: 'exact', head: true })
            .in('address_normalized', addresses)
        : Promise.resolve({ count: 0 })

      const shvrQ = hasAddr
        ? supabase
            .from('complaints_311')
            .select('*', { count: 'exact', head: true })
            .in('address_normalized', addresses)
            .eq('sr_short_code', 'SHVR')
            .in('status', ['Open', 'OPEN', 'open'])
        : Promise.resolve({ count: 0 })

      const stopWorkQ = hasAddr
        ? supabase
            .from('violations')
            .select('*', { count: 'exact', head: true })
            .in('address_normalized', addresses)
            .eq('is_stop_work_order', true)
            .or(
              'violation_status.eq.OPEN,violation_status.eq.FAILED,violation_status.eq.Open,violation_status.eq.Failed,inspection_status.eq.OPEN,inspection_status.eq.FAILED,inspection_status.eq.Open,inspection_status.eq.Failed'
            )
        : Promise.resolve({ count: 0 })

      const latestViolationQ = hasAddr
        ? supabase
            .from('violations')
            .select('violation_date')
            .in('address_normalized', addresses)
            .order('violation_date', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null })

      const latestPermitQ = hasAddr
        ? supabase
            .from('permits')
            .select('issue_date')
            .in('address_normalized', addresses)
            .order('issue_date', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null })

      const recentComplaintsQ = hasAddr
        ? supabase
            .from('complaints_311')
            .select('sr_type, created_date, sr_number, status')
            .in('address_normalized', addresses)
            .order('created_date', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] })

      const recentViolationsQ = hasAddr
        ? supabase
            .from('violations')
            .select(
              'violation_description, violation_date, violation_status, inspection_category, department_bureau, inspection_status'
            )
            .in('address_normalized', addresses)
            .order('violation_date', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] })

      const recentPermitsQ = hasAddr
        ? supabase
            .from('permits')
            .select('permit_type, work_description, issue_date, reported_cost, total_fee')
            .in('address_normalized', addresses)
            .order('issue_date', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] })

      const [
        ov,
        oc,
        tp,
        sh,
        sw,
        lv,
        lp,
        rc,
        rv,
        rp,
      ] = await Promise.all([
        openViolQ,
        openComplaintsQ,
        totalPermitsQ,
        shvrQ,
        stopWorkQ,
        latestViolationQ,
        latestPermitQ,
        recentComplaintsQ,
        recentViolationsQ,
        recentPermitsQ,
      ])

      return {
        ...prop,
        open_violations: ov.count ?? 0,
        open_complaints: oc.count ?? 0,
        total_permits: tp.count ?? 0,
        shvr_count: sh.count ?? 0,
        is_pbl: isPbl,
        has_stop_work: (sw.count ?? 0) > 0,
        implied_value: impliedValue,
        community_area: communityArea,
        property_class: classInfo,
        building_chars: buildingChars,
        latest_violation_date: (lv.data as { violation_date?: string } | null)?.violation_date ?? null,
        latest_permit_date: (lp.data as { issue_date?: string } | null)?.issue_date ?? null,
        recent_complaints: (rc.data as Record<string, unknown>[]) ?? [],
        recent_violations: (rv.data as Record<string, unknown>[]) ?? [],
        recent_permits: (rp.data as Record<string, unknown>[]) ?? [],
      }
    })
  )

  return NextResponse.json({ properties: enriched })
}
