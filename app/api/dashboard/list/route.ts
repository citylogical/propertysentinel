import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizePinSilent } from '@/lib/supabase-search'

type PortfolioRow = {
  id: string
  canonical_address: string | null
  pins: string[] | null
  [key: string]: unknown
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

function pinKeyVariants(pin: string): string[] {
  const n = normalizePinSilent(pin.trim())
  if (!n) return []
  const compact = n.replace(/-/g, '')
  const uniq = new Set<string>([n, compact])
  return [...uniq]
}

/** Head-count per address in parallel chunks to avoid huge row payloads and default row limits. */
async function countByAddressHead(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  addresses: string[],
  apply: (q: ReturnType<ReturnType<typeof supabase.from>['select']>) => unknown
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (!addresses.length) return out

  const chunkSize = 40
  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize)
    const counts = await Promise.all(
      chunk.map(async (addr) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = supabase.from(table).select('*', { count: 'exact', head: true }).eq('address_normalized', addr)
        q = apply(q)
        const { count, error } = await q
        if (error) {
          console.error(`Portfolio list count ${table}:`, error.message)
          return [addr, 0] as const
        }
        return [addr, count ?? 0] as const
      })
    )
    for (const [addr, c] of counts) out[addr] = c
  }
  return out
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

  const rows = properties as PortfolioRow[]

  const allPinsRaw: string[] = []
  for (const p of rows) {
    const normalized = normalizePinList(p.pins ?? null)
    allPinsRaw.push(...normalized)
  }
  const uniquePins = [...new Set(allPinsRaw)]

  const pinToAddresses: Record<string, string[]> = {}
  if (uniquePins.length > 0) {
    const { data: pinRows, error: pinErr } = await supabase
      .from('properties')
      .select('pin, address_normalized')
      .in('pin', uniquePins)

    if (pinErr) {
      console.error('Portfolio list pin→address:', pinErr.message)
    } else if (pinRows) {
      for (const row of pinRows as { pin?: string | null; address_normalized?: string | null }[]) {
        const pin = row.pin
        const addr = row.address_normalized?.trim()
        if (!pin || !addr) continue
        if (!pinToAddresses[pin]) pinToAddresses[pin] = []
        if (!pinToAddresses[pin].includes(addr)) pinToAddresses[pin].push(addr)
      }
    }
  }

  const propAddresses: Record<string, string[]> = {}
  const allAddresses: string[] = []

  for (const p of rows) {
    const addrs: string[] = []
    const c = p.canonical_address?.trim()
    if (c) addrs.push(c)
    const pins = normalizePinList(p.pins ?? null)
    for (const pin of pins) {
      const resolved = pinToAddresses[pin] || []
      for (const a of resolved) {
        if (!addrs.includes(a)) addrs.push(a)
      }
    }
    propAddresses[p.id] = addrs
    for (const a of addrs) {
      if (!allAddresses.includes(a)) allAddresses.push(a)
    }
  }

  const openViolationOr = [
    'violation_status.eq.OPEN',
    'violation_status.eq.FAILED',
    'violation_status.eq.Open',
    'violation_status.eq.Failed',
    'inspection_status.eq.OPEN',
    'inspection_status.eq.FAILED',
    'inspection_status.eq.Open',
    'inspection_status.eq.Failed',
  ].join(',')

  const [
    violCounts,
    complaintCounts,
    permitCounts,
    shvrCounts,
    stopWorkCounts,
    pblData,
    charsData,
    classData,
    communityData,
    assessedData,
  ] = await Promise.all([
    allAddresses.length
      ? countByAddressHead(supabase, 'violations', allAddresses, (q) => q.or(openViolationOr))
      : Promise.resolve({} as Record<string, number>),
    allAddresses.length
      ? countByAddressHead(supabase, 'complaints_311', allAddresses, (q) => q.in('status', ['Open', 'OPEN', 'open']))
      : Promise.resolve({} as Record<string, number>),
    allAddresses.length
      ? countByAddressHead(supabase, 'permits', allAddresses, (q) => q)
      : Promise.resolve({} as Record<string, number>),
    allAddresses.length
      ? countByAddressHead(supabase, 'complaints_311', allAddresses, (q) =>
          q.eq('sr_short_code', 'SHVR').in('status', ['Open', 'OPEN', 'open'])
        )
      : Promise.resolve({} as Record<string, number>),
    allAddresses.length
      ? countByAddressHead(supabase, 'violations', allAddresses, (q) =>
          q.eq('is_stop_work_order', true).or(openViolationOr)
        )
      : Promise.resolve({} as Record<string, number>),
    uniquePins.length > 0
      ? supabase.from('str_prohibited_buildings').select('pin').in('pin', uniquePins)
      : Promise.resolve({ data: [] as { pin: string }[] }),
    uniquePins.length > 0
      ? supabase
          .from('property_chars_residential')
          .select(
            'pin, year_built, building_sqft, num_apartments, type_of_residence, construction_quality, ext_wall_material, roof_material, repair_condition'
          )
          .in('pin', uniquePins)
          .order('tax_year', { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    uniquePins.length > 0
      ? supabase.from('properties').select('pin, property_class').in('pin', uniquePins)
      : Promise.resolve({ data: [] as { pin: string; property_class: string | null }[] }),
    uniquePins.length > 0
      ? supabase
          .from('parcel_universe')
          .select('pin, community_area_name')
          .in('pin', uniquePins)
          .order('tax_year', { ascending: false })
      : Promise.resolve({ data: [] as { pin: string; community_area_name: string | null }[] }),
    uniquePins.length > 0
      ? supabase
          .from('assessed_values')
          .select('pin, board_tot, certified_tot, mailed_tot, tax_year')
          .in(
            'pin',
            uniquePins.map((p) => p.replace(/-/g, ''))
          )
          .order('tax_year', { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const sumCounts = (addrs: string[], map: Record<string, number>) =>
    addrs.reduce((s, a) => s + (map[a] ?? 0), 0)

  const pblPins = new Set<string>()
  for (const r of (pblData as { data?: { pin?: string | null }[] }).data || []) {
    const pk = normalizePinSilent(String(r.pin ?? ''))
    if (!pk) continue
    pblPins.add(pk)
    pblPins.add(pk.replace(/-/g, ''))
  }

  const charsMap: Record<string, Record<string, unknown>> = {}
  for (const row of (charsData as { data?: Record<string, unknown>[] }).data || []) {
    const pin = row.pin as string | undefined
    if (pin && !charsMap[pin]) charsMap[pin] = row
  }

  const classMap: Record<string, string> = {}
  for (const row of (classData as { data?: { pin?: string; property_class?: string | null }[] }).data || []) {
    if (row.pin && row.property_class) classMap[row.pin] = row.property_class
  }

  const communityMap: Record<string, string> = {}
  for (const row of (communityData as { data?: { pin?: string; community_area_name?: string | null }[] }).data || []) {
    if (row.pin && row.community_area_name && !communityMap[row.pin]) {
      communityMap[row.pin] = row.community_area_name
    }
  }

  const avByPin: Record<string, number> = {}
  const seenAvPin = new Set<string>()
  for (const row of (assessedData as { data?: Record<string, unknown>[] }).data || []) {
    const rawPin = String(row.pin ?? '')
    if (!rawPin) continue
    const compact = rawPin.replace(/-/g, '')
    if (seenAvPin.has(compact)) continue
    const val = row.board_tot ?? row.certified_tot ?? row.mailed_tot
    const n = Number(val)
    if (!Number.isFinite(n) || n <= 0) continue
    seenAvPin.add(compact)
    avByPin[compact] = n
    avByPin[rawPin] = n
  }

  const enriched = rows.map((p) => {
    const addrs = propAddresses[p.id] || []
    const pins = normalizePinList(p.pins ?? null)
    const primaryPin = pins[0] ?? null

    const openViolations = sumCounts(addrs, violCounts)
    const openComplaints = sumCounts(addrs, complaintCounts)
    const totalPermits = sumCounts(addrs, permitCounts)
    const shvrCount = sumCounts(addrs, shvrCounts)
    const hasStopWork = addrs.some((a) => (stopWorkCounts[a] ?? 0) > 0)

    const isPbl = pins.some((pin) => {
      for (const k of pinKeyVariants(pin)) {
        if (pblPins.has(k)) return true
      }
      return false
    })

    const chars = primaryPin ? charsMap[primaryPin] ?? null : null
    const propClass = primaryPin ? classMap[primaryPin] ?? null : null
    const community = primaryPin ? communityMap[primaryPin] ?? null : null

    let impliedValue: number | null = null
    const pinVals = pins
      .map((pin) => {
        for (const k of pinKeyVariants(pin)) {
          const compact = k.replace(/-/g, '')
          const v = avByPin[compact] ?? avByPin[k]
          if (v != null && v > 0) return v
        }
        return 0
      })
      .filter((v) => v > 0)
    if (pinVals.length > 0) {
      impliedValue = pinVals.reduce((sum, v) => sum + v, 0) * 10
    }

    return {
      ...p,
      open_violations: openViolations,
      open_complaints: openComplaints,
      total_permits: totalPermits,
      shvr_count: shvrCount,
      is_pbl: isPbl,
      has_stop_work: hasStopWork,
      implied_value: impliedValue,
      community_area: community,
      property_class: propClass,
      building_chars: chars,
      latest_violation_date: null,
      latest_permit_date: null,
      recent_complaints: [],
      recent_violations: [],
      recent_permits: [],
    }
  })

  return NextResponse.json({ properties: enriched })
}
