import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { PM_HOT_SR_CODES, PM_HOT_OPEN_STATUS } from '@/lib/pm-hot-codes'
import { formatAddressForDisplay, addressToSlug } from '@/lib/formatAddress'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Company → hot buildings drill-down for the PM Lead Intel explore table.
// Mirrors the pm_lead_intel view's own semantics (workers repo,
// sql/pm_lead_intel.sql) so the modal's numbers reconcile with the table row:
// buildings come from pm_buildings by company_id, each building's full
// address vocabulary comes from its staging row's addresses_expanded, and
// "hot" is the shared 12-code set with open = status 'Open'. Complaints are
// deduped on sr_number, exactly like the view.

type BuildingRow = {
  company_role: string
  source: string
  source_row_id: string | null
  building_name: string | null
  address_raw: string | null
  address_normalized: string | null
  city: string | null
  zip: string | null
  units_total: number | null
}

type ComplaintRow = {
  sr_number: string
  address_normalized: string | null
  sr_short_code: string | null
  sr_type: string | null
  status: string | null
  created_date: string | null
  pin: string | null
  community_area: string | null
}

type BuildingOut = {
  address: string
  display_address: string
  slug: string
  building_name: string | null
  roles: string[]
  sources: string[]
  units: number | null
  city: string | null
  zip: string | null
  community_area: string | null
  pins: string[]
  hot_open: number
  hot_total: number
  last_hot: string | null
  open_complaints: Array<{
    sr_number: string
    sr_short_code: string | null
    sr_type: string | null
    created_date: string | null
  }>
}

const OPEN_COMPLAINTS_CAP = 50

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Same gate as the explore query route — this is lead intel, not subscriber data.
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', userId)
    .single()
  if (!subscriber || !['admin', 'approved'].includes(subscriber.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const companyId = Number(req.nextUrl.searchParams.get('companyId'))
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const { data: company, error: companyErr } = await supabase
    .from('pm_companies')
    .select('id, name, segment')
    .eq('id', companyId)
    .maybeSingle()
  if (companyErr) {
    return NextResponse.json({ error: companyErr.message }, { status: 500 })
  }
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // pm_buildings is a few hundred rows per company at most, but stay on the
  // .range() convention rather than trusting default limits.
  const { data: buildingRows, error: bErr } = await supabase
    .from('pm_buildings')
    .select(
      'company_role, source, source_row_id, building_name, address_raw, address_normalized, city, zip, units_total'
    )
    .eq('company_id', companyId)
    .range(0, 1999)
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 })
  }

  // ── Expanded address vocabulary per staging source ──────────────────────
  // pm_buildings stores the source-form address only; the staging tables'
  // addresses_expanded arrays carry every known form (source, range-expanded,
  // Assessor-corrected). Keyed by (source, source_row_id).
  const bldgs = (buildingRows ?? []) as BuildingRow[]
  const idsBySource: Record<'hud_mf' | 'arhd' | 'kcro', string[]> = {
    hud_mf: [],
    arhd: [],
    kcro: [],
  }
  for (const b of bldgs) {
    if (!b.source_row_id) continue
    if (b.source === 'hud_mf') idsBySource.hud_mf.push(b.source_row_id)
    else if (b.source === 'arhd') idsBySource.arhd.push(b.source_row_id)
    else if (b.source === 'kcro') idsBySource.kcro.push(b.source_row_id)
  }

  const expandedByKey = new Map<string, string[]>()
  const mergeExpanded = (source: string, rowId: string, forms: string[] | null) => {
    if (!forms || forms.length === 0) return
    const key = `${source}|${rowId}`
    const existing = expandedByKey.get(key)
    if (existing) {
      expandedByKey.set(key, [...new Set([...existing, ...forms])])
    } else {
      expandedByKey.set(key, [...new Set(forms)])
    }
  }

  const [hudRes, arhdRes, kcroRes] = await Promise.all([
    idsBySource.hud_mf.length > 0
      ? supabase
          .from('hud_mf_raw')
          .select('property_id, addresses_expanded')
          .in('property_id', [...new Set(idsBySource.hud_mf)])
          .range(0, 1999)
      : Promise.resolve({ data: [], error: null }),
    idsBySource.arhd.length > 0
      ? supabase
          .from('arhd_raw')
          .select('id, addresses_expanded')
          .in('id', [...new Set(idsBySource.arhd)])
          .range(0, 1999)
      : Promise.resolve({ data: [], error: null }),
    idsBySource.kcro.length > 0
      ? supabase
          .from('kcro_raw')
          .select('source_id, addresses_expanded')
          .in('source_id', [...new Set(idsBySource.kcro)])
          .range(0, 1999)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of (hudRes.data ?? []) as Array<{ property_id: string; addresses_expanded: string[] | null }>) {
    mergeExpanded('hud_mf', r.property_id, r.addresses_expanded)
  }
  for (const r of (arhdRes.data ?? []) as Array<{ id: number; addresses_expanded: string[] | null }>) {
    mergeExpanded('arhd', String(r.id), r.addresses_expanded)
  }
  for (const r of (kcroRes.data ?? []) as Array<{ source_id: string; addresses_expanded: string[] | null }>) {
    mergeExpanded('kcro', r.source_id, r.addresses_expanded)
  }

  // ── Collapse to ADDRESS grain ───────────────────────────────────────────
  // A HUD property whose owner and manager are both this company produces two
  // pm_buildings rows; KCRO can register the same building under multiple
  // events. Group everything by the building's primary normalized address.
  type Group = {
    address: string
    building_name: string | null
    roles: Set<string>
    sources: Set<string>
    units: number | null
    city: string | null
    zip: string | null
    forms: Set<string>
  }
  const groups = new Map<string, Group>()
  for (const b of bldgs) {
    const primary = (b.address_normalized ?? b.address_raw ?? '').trim().toUpperCase()
    if (!primary) continue
    let g = groups.get(primary)
    if (!g) {
      g = {
        address: primary,
        building_name: null,
        roles: new Set(),
        sources: new Set(),
        units: null,
        city: null,
        zip: null,
        forms: new Set([primary]),
      }
      groups.set(primary, g)
    }
    g.roles.add(b.company_role)
    g.sources.add(b.source)
    if (b.building_name && !g.building_name) g.building_name = b.building_name.trim() || null
    if (b.units_total != null && (g.units == null || b.units_total > g.units)) g.units = b.units_total
    if (b.city && !g.city) g.city = b.city
    if (b.zip && !g.zip) g.zip = b.zip
    if (b.source_row_id) {
      for (const form of expandedByKey.get(`${b.source}|${b.source_row_id}`) ?? []) {
        g.forms.add(form)
      }
    }
  }

  // Address form → owning group. On the rare collision (two buildings whose
  // expanded ranges overlap) the first group keeps the form; company-level
  // totals below are computed on distinct sr_numbers so they stay correct.
  const groupByForm = new Map<string, Group>()
  for (const g of groups.values()) {
    for (const form of g.forms) {
      if (!groupByForm.has(form)) groupByForm.set(form, g)
    }
  }

  // ── Hot complaints across the whole book ────────────────────────────────
  // complaints_311 is 13M rows: chunk the address list to keep PostgREST URLs
  // sane, and page each chunk with .range() (never trust .limit()).
  const allForms = [...groupByForm.keys()]
  const complaintsBySr = new Map<string, ComplaintRow>()
  const PAGE = 1000
  for (const formChunk of chunk(allForms, 120)) {
    let from = 0
    for (;;) {
      const { data: rows, error: cErr } = await supabase
        .from('complaints_311')
        .select(
          'sr_number, address_normalized, sr_short_code, sr_type, status, created_date, pin, community_area'
        )
        .in('address_normalized', formChunk)
        .in('sr_short_code', [...PM_HOT_SR_CODES])
        .range(from, from + PAGE - 1)
      if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 500 })
      }
      for (const row of (rows ?? []) as ComplaintRow[]) {
        if (row.sr_number && !complaintsBySr.has(row.sr_number)) {
          complaintsBySr.set(row.sr_number, row)
        }
      }
      if (!rows || rows.length < PAGE) break
      from += PAGE
    }
  }

  // ── Aggregate per building ──────────────────────────────────────────────
  type Agg = {
    hot_open: number
    hot_total: number
    last_hot: string | null
    community_area: string | null
    pins: Set<string>
    open_complaints: BuildingOut['open_complaints']
  }
  const aggByGroup = new Map<Group, Agg>()
  const getAgg = (g: Group): Agg => {
    let a = aggByGroup.get(g)
    if (!a) {
      a = { hot_open: 0, hot_total: 0, last_hot: null, community_area: null, pins: new Set(), open_complaints: [] }
      aggByGroup.set(g, a)
    }
    return a
  }

  let totalOpen = 0
  let totalHot = 0
  for (const c of complaintsBySr.values()) {
    totalHot++
    const isOpen = c.status === PM_HOT_OPEN_STATUS
    if (isOpen) totalOpen++
    const g = c.address_normalized ? groupByForm.get(c.address_normalized) : undefined
    if (!g) continue
    const a = getAgg(g)
    a.hot_total++
    // FOOTGUN: created_date is Chicago wall-clock with a false +00:00 suffix —
    // slice, never timezone-convert.
    const day = c.created_date ? c.created_date.slice(0, 10) : null
    if (day && (!a.last_hot || day > a.last_hot)) a.last_hot = day
    if (c.pin) a.pins.add(c.pin)
    if (c.community_area && !a.community_area) a.community_area = c.community_area
    if (isOpen) {
      a.hot_open++
      if (a.open_complaints.length < OPEN_COMPLAINTS_CAP) {
        a.open_complaints.push({
          sr_number: c.sr_number,
          sr_short_code: c.sr_short_code,
          sr_type: c.sr_type,
          created_date: day,
        })
      }
    }
  }

  const buildings: BuildingOut[] = [...groups.values()].map((g) => {
    const a = aggByGroup.get(g)
    const display = formatAddressForDisplay(g.address)
    const openSorted = (a?.open_complaints ?? []).sort((x, y) =>
      (y.created_date ?? '').localeCompare(x.created_date ?? '')
    )
    return {
      address: g.address,
      display_address: display,
      slug: addressToSlug(display),
      building_name: g.building_name,
      roles: [...g.roles].sort(),
      sources: [...g.sources].sort(),
      units: g.units,
      city: g.city,
      zip: g.zip,
      community_area: a?.community_area ?? null,
      pins: [...(a?.pins ?? [])],
      hot_open: a?.hot_open ?? 0,
      hot_total: a?.hot_total ?? 0,
      last_hot: a?.last_hot ?? null,
      open_complaints: openSorted,
    }
  })
  buildings.sort((x, y) => {
    if (y.hot_open !== x.hot_open) return y.hot_open - x.hot_open
    if (y.hot_total !== x.hot_total) return y.hot_total - x.hot_total
    return x.address.localeCompare(y.address)
  })

  return NextResponse.json({
    company: { id: company.id, name: company.name, segment: company.segment },
    totals: {
      buildings: buildings.length,
      hot_open: totalOpen,
      hot_total: totalHot,
    },
    buildings,
  })
}
