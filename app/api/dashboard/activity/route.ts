import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { chunkedIn, getAllAddresses } from '@/lib/portfolio-stats'
import { DEFAULT_VISIBLE_CODES } from '@/lib/sr-codes'

export const runtime = 'nodejs'
export const maxDuration = 30

const COMPLAINT_FIELDS =
  'sr_number, sr_short_code, sr_type, status, created_date, closed_date, ' +
  'address, address_normalized, ' +
  'standard_description, complaint_description, complainant_type, unit_number, ' +
  'danger_reported, owner_notified, owner_occupied, ' +
  'concern_category, problem_category, restaurant_name, business_name, ' +
  'sla_target_days, actual_mean_days, estimated_completion, ' +
  'work_order_status, workflow_step, work_order_steps, final_outcome'

const VIOLATION_FIELDS =
  'violation_id, violation_code, violation_description, violation_inspector_comments, ' +
  'violation_ordinance, violation_status, inspection_status, ' +
  'violation_date, violation_last_modified_date, ' +
  'inspection_category, department_bureau, inspection_number, ' +
  'is_stop_work_order, address, address_normalized'

const PERMIT_FIELDS =
  'permit_number, permit_type, permit_status, work_description, ' +
  'issue_date, reported_cost, total_fee, ' +
  'contact_1_name, contact_1_type, address, address_normalized'

// Default-visible 311 SR codes — same set as lib/portfolio-stats.ts (open_building_complaints / total_building_complaints_12mo).
const BUILDING_SR_CODES = Array.from(DEFAULT_VISIBLE_CODES)

type ComplaintRow = Record<string, unknown> & {
  sr_number?: string | null
  sr_type?: string | null
  status?: string | null
  created_date?: string | null
  address_normalized?: string | null
}

type ViolationRow = Record<string, unknown> & {
  violation_id?: string | null
  inspection_number?: string | null
  inspection_category?: string | null
  department_bureau?: string | null
  violation_status?: string | null
  inspection_status?: string | null
  violation_date?: string | null
  address_normalized?: string | null
}

type PermitRow = Record<string, unknown> & {
  permit_number?: string | null
  permit_type?: string | null
  issue_date?: string | null
  address_normalized?: string | null
  reported_cost?: number | string | null
}

type ActivityRow = {
  category: 'complaint' | 'violation' | 'permit'
  id: string
  date: string // ISO date string used for sorting
  display_type: string // human-readable type label
  status: 'open' | 'closed' | 'active' | 'expired' | null
  property_id: string
  property_address: string
  property_slug: string | null
  community_area: string | null
  // Underlying record(s) for the right-hand detail panel
  complaint?: ComplaintRow
  violations?: ViolationRow[]
  permit?: PermitRow
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 200)
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0)

  // range: 12mo | 6mo | 3mo | 1mo | 1wk; default 1wk so first paint stays snappy
  const rangeParam = (searchParams.get('range') ?? '1wk') as '12mo' | '6mo' | '3mo' | '1mo' | '1wk'
  const RANGE_DAYS: Record<typeof rangeParam, number> = {
    '12mo': 365,
    '6mo': 182,
    '3mo': 91,
    '1mo': 30,
    '1wk': 7,
  }
  const rangeDays = RANGE_DAYS[rangeParam] ?? 7

  // category: which underlying tables to query
  const categoryParam = (searchParams.get('category') ?? 'all') as 'all' | '311' | 'violation' | 'permit'
  const buildingFilter = (searchParams.get('building_filter') ?? 'building') as 'all' | 'building' | 'other'
  const statusFilter = (searchParams.get('status') ?? 'all') as 'all' | 'open' | 'closed'
  const searchQuery = (searchParams.get('search') ?? '').trim()

  const supabase = getSupabaseAdmin()

  // Fetch user's portfolio. Each property expands into one or more
  // normalized addresses we need to filter by across all three tables.
  const { data: properties, error: propsErr } = await supabase
    .from('portfolio_properties')
    .select('id, canonical_address, address_range, additional_streets, slug, community_area, display_name')
    .eq('user_id', userId)

  if (propsErr) {
    return NextResponse.json({ error: propsErr.message }, { status: 500 })
  }

  const props = (properties ?? []) as {
    id: string
    canonical_address: string
    address_range: string | null
    additional_streets: string[] | null
    slug: string | null
    community_area: string | null
    display_name: string | null
  }[]

  if (props.length === 0) {
    return NextResponse.json({ items: [], total: 0, limit, offset, has_properties: false })
  }

  // Build address → property map. One address can only belong to one
  // portfolio property within a user's portfolio (enforced upstream),
  // so we use a Map<addressNormalized, propertyMeta>.
  const addressToProperty = new Map<
    string,
    {
      id: string
      address: string
      slug: string | null
      community_area: string | null
    }
  >()
  for (const p of props) {
    const meta = {
      id: p.id,
      address: p.display_name || p.canonical_address,
      slug: p.slug,
      community_area: p.community_area,
    }
    for (const addr of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
      addressToProperty.set(addr, meta)
    }
  }

  const allAddresses = Array.from(addressToProperty.keys())
  if (allAddresses.length === 0) {
    return NextResponse.json({ items: [], total: 0, limit, offset, has_properties: true })
  }

  const rangeCutoff = new Date(Date.now() - rangeDays * 86400000).toISOString()

  // ── Complaints ─────────────────────────────────────────────────────────
  const { data: complaints, error: complaintsErr } = await chunkedIn<ComplaintRow>(
    allAddresses,
    200,
    (chunk) => {
      let q = supabase
        .from('complaints_311')
        .select(COMPLAINT_FIELDS)
        .in('address_normalized', chunk)
        .gte('created_date', rangeCutoff)
        .order('created_date', { ascending: false })
        .limit(500)

      if (categoryParam !== 'all' && categoryParam !== '311') {
        q = q.eq('sr_short_code', '__NONE__')
      }
      if (buildingFilter === 'building') {
        q = q.in('sr_short_code', BUILDING_SR_CODES)
      } else if (buildingFilter === 'other') {
        q = q.not(
          'sr_short_code',
          'in',
          `(${BUILDING_SR_CODES.map((c) => `"${c}"`).join(',')})`
        )
      }
      if (statusFilter === 'open') {
        q = q.ilike('status', 'open')
      } else if (statusFilter === 'closed') {
        q = q.not('status', 'ilike', 'open')
      }
      if (searchQuery) {
        q = q.ilike('address_normalized', `%${searchQuery.toUpperCase()}%`)
      }

      return q
    },
    (row) => String(row.sr_number ?? '')
  )

  if (complaintsErr) {
    return NextResponse.json({ error: complaintsErr }, { status: 500 })
  }

  // ── Violations ─────────────────────────────────────────────────────────
  const { data: violations, error: violationsErr } = await chunkedIn<ViolationRow>(
    allAddresses,
    200,
    (chunk) => {
      let q = supabase
        .from('violations')
        .select(VIOLATION_FIELDS)
        .in('address_normalized', chunk)
        .gte('violation_date', rangeCutoff)
        .order('violation_date', { ascending: false })
        .limit(500)

      if (categoryParam !== 'all' && categoryParam !== 'violation') {
        q = q.eq('violation_id', '__NONE__')
      }
      if (statusFilter === 'open') {
        q = q.or(
          'violation_status.ilike.open,violation_status.ilike.failed,inspection_status.ilike.open,inspection_status.ilike.failed'
        )
      } else if (statusFilter === 'closed') {
        q = q.not('violation_status', 'ilike', 'open').not('violation_status', 'ilike', 'failed')
      }
      if (searchQuery) {
        q = q.ilike('address_normalized', `%${searchQuery.toUpperCase()}%`)
      }

      return q
    },
    // Violations use inspection_number as a grouping key downstream; for chunk
    // dedupe use violation_id (the primary key) since the same violation row
    // can't appear in two chunks (chunks partition the address set).
    (row) => String(row.violation_id ?? '')
  )

  if (violationsErr) {
    return NextResponse.json({ error: violationsErr }, { status: 500 })
  }

  // ── Permits ────────────────────────────────────────────────────────────
  const { data: permits, error: permitsErr } = await chunkedIn<PermitRow>(
    allAddresses,
    200,
    (chunk) => {
      let q = supabase
        .from('permits')
        .select(PERMIT_FIELDS)
        .in('address_normalized', chunk)
        .gte('issue_date', rangeCutoff)
        .order('issue_date', { ascending: false })
        .limit(500)

      if (categoryParam !== 'all' && categoryParam !== 'permit') {
        q = q.eq('permit_number', '__NONE__')
      }
      if (statusFilter !== 'all') {
        q = q.eq('permit_number', '__NONE__')
      }
      if (searchQuery) {
        q = q.ilike('address_normalized', `%${searchQuery.toUpperCase()}%`)
      }

      return q
    },
    (row) => String(row.permit_number ?? '')
  )

  if (permitsErr) {
    return NextResponse.json({ error: permitsErr }, { status: 500 })
  }

  // ── Normalize complaints ───────────────────────────────────────────────
  const complaintRows = ((complaints ?? []) as unknown as ComplaintRow[])
    .map((c) => {
      const addrKey = String(c.address_normalized ?? '')
      const meta = addressToProperty.get(addrKey)
      if (!meta) return null
      const status = String(c.status ?? '').toLowerCase()
      const normalizedStatus: ActivityRow['status'] = status === 'open' ? 'open' : 'closed'
      return {
        category: 'complaint' as const,
        id: c.sr_number ? String(c.sr_number) : `complaint-${addrKey}-${c.created_date}`,
        date: String(c.created_date ?? ''),
        display_type: c.sr_type ? String(c.sr_type) : 'Complaint',
        status: normalizedStatus,
        property_id: meta.id,
        property_address: meta.address,
        property_slug: meta.slug,
        community_area: meta.community_area,
        complaint: c,
      } satisfies ActivityRow
    })
    .filter((r) => r !== null && !!r.date) as ActivityRow[]

  // ── Group violations by inspection_number ──────────────────────────────
  // Server-side grouping mirrors PortfolioDetail's existing logic. One
  // inspection becomes one activity row with multiple violation codes.
  const violationGroups = new Map<
    string,
    {
      first: ViolationRow
      sources: ViolationRow[]
      isOpen: boolean
    }
  >()
  for (const row of (violations ?? []) as unknown as ViolationRow[]) {
    const key = String(row.inspection_number ?? row.violation_id ?? Math.random())
    const existing = violationGroups.get(key)
    const status = String(row.violation_status ?? row.inspection_status ?? '').toUpperCase()
    const isOpen = status === 'OPEN' || status === 'FAILED'
    if (existing) {
      existing.sources.push(row)
      if (isOpen) existing.isOpen = true
    } else {
      violationGroups.set(key, { first: row, sources: [row], isOpen })
    }
  }

  const violationRows = Array.from(violationGroups.values())
    .map((g) => {
      const addrKey = String(g.first.address_normalized ?? '')
      const meta = addressToProperty.get(addrKey)
      if (!meta) return null
      const category = g.first.inspection_category || 'Violation'
      const bureau = g.first.department_bureau || ''
      const countSuffix = g.sources.length > 1 ? ` · ${g.sources.length} violations` : ''
      const label = bureau ? `${category} · ${bureau}${countSuffix}` : `${category}${countSuffix}`
      return {
        category: 'violation' as const,
        id: String(g.first.inspection_number ?? g.first.violation_id ?? `violation-${addrKey}-${g.first.violation_date}`),
        date: String(g.first.violation_date ?? ''),
        display_type: label,
        status: g.isOpen ? 'open' : 'closed',
        property_id: meta.id,
        property_address: meta.address,
        property_slug: meta.slug,
        community_area: meta.community_area,
        violations: g.sources,
      } satisfies ActivityRow
    })
    .filter((r) => r !== null && !!r.date) as ActivityRow[]

  // ── Normalize permits ──────────────────────────────────────────────────
  const permitRows = ((permits ?? []) as unknown as PermitRow[])
    .map((p) => {
      const addrKey = String(p.address_normalized ?? '')
      const meta = addressToProperty.get(addrKey)
      if (!meta) return null
      const cost =
        p.reported_cost != null && Number(p.reported_cost) > 0
          ? ` — $${Number(p.reported_cost).toLocaleString()}`
          : ''
      const label = `${p.permit_type ?? 'Permit'}${cost}`
      // Permit "active" vs "expired" is a function of issue_date age (540d window).
      // Keep it null in the feed; the detail panel computes it precisely.
      return {
        category: 'permit' as const,
        id: p.permit_number ? String(p.permit_number) : `permit-${addrKey}-${p.issue_date}`,
        date: String(p.issue_date ?? ''),
        display_type: label,
        status: null,
        property_id: meta.id,
        property_address: meta.address,
        property_slug: meta.slug,
        community_area: meta.community_area,
        permit: p,
      } satisfies ActivityRow
    })
    .filter((r) => r !== null && !!r.date) as ActivityRow[]

  // ── Merge + sort ───────────────────────────────────────────────────────
  const merged = [...complaintRows, ...violationRows, ...permitRows].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const total = merged.length
  const items = merged.slice(offset, offset + limit)

  return NextResponse.json({
    items,
    total,
    limit,
    offset,
    range: rangeParam,
    category: categoryParam,
    building_filter: buildingFilter,
    status: statusFilter,
    search: searchQuery || null,
    has_properties: true,
  })
}
