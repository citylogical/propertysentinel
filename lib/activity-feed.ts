import type { SupabaseClient } from '@supabase/supabase-js'
import { chunkedIn, getAllAddresses } from '@/lib/portfolio-stats'
import { addressToSlug } from '@/lib/formatAddress'
import { getEnabledCodes } from '@/lib/sr-preferences'

// Shared activity-feed query core, extracted verbatim from
// app/api/dashboard/activity/route.ts so the public demo route
// (app/api/demo/activity) can serve the identical feed for a demo
// portfolio's user_id without duplicating 400 lines. The dashboard route
// keeps its Clerk auth + entitlement gate and delegates here.

// Street type tokens used to identify the end of an address proper (everything
// after one of these is treated as a unit suffix and stripped for matching).
const STREET_TYPES = new Set([
  'ST', 'AVE', 'BLVD', 'DR', 'CT', 'PL', 'LN', 'RD',
  'WAY', 'PKWY', 'TER', 'CIR', 'HWY',
])

type UserBuildingRange = {
  searched_address: string | null
  street1_low: string | null
  street1_high: string | null
  street2_low: string | null
  street2_high: string | null
  street3_low: string | null
  street3_high: string | null
  street4_low: string | null
  street4_high: string | null
}

/**
 * Strip a unit suffix from a normalized address. The unit is anything trailing
 * the street type token. Returns the input unchanged when no street type found.
 *   "6030 N SHERIDAN RD 102" → "6030 N SHERIDAN RD"
 *   "6030 N SHERIDAN RD"     → "6030 N SHERIDAN RD"
 */
function stripUnitSuffix(normalizedAddress: string): string {
  const tokens = normalizedAddress.trim().toUpperCase().split(/\s+/)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STREET_TYPES.has(tokens[i])) {
      return tokens.slice(0, i + 1).join(' ')
    }
  }
  return normalizedAddress.toUpperCase().trim()
}

/**
 * Returns the user_building_ranges row whose street1-4 ranges cover the given
 * base address (number-in-range and same street name). Used to translate a
 * portfolio_properties.canonical_address (which may carry a unit suffix or use
 * a different searched form) into the searched_address string that lives in
 * user_building_ranges — which is what findApprovedUserRange direct-matches
 * on the property page.
 */
function findCoveringRange(
  baseAddress: string,
  ranges: UserBuildingRange[]
): UserBuildingRange | null {
  const baseParts = baseAddress.split(/\s+/)
  const baseNum = parseInt(baseParts[0] ?? '', 10)
  const baseStreet = baseParts.slice(1).join(' ')
  if (Number.isNaN(baseNum) || !baseStreet) return null

  for (const r of ranges) {
    for (let i = 1; i <= 4; i++) {
      const low = r[`street${i}_low` as keyof UserBuildingRange] as string | null
      const high = r[`street${i}_high` as keyof UserBuildingRange] as string | null
      if (!low || !high) continue
      const lowParts = low.toUpperCase().split(/\s+/)
      const highParts = high.toUpperCase().split(/\s+/)
      const lowNum = parseInt(lowParts[0] ?? '', 10)
      const highNum = parseInt(highParts[0] ?? '', 10)
      const lowStreet = lowParts.slice(1).join(' ')
      const highStreet = highParts.slice(1).join(' ')
      if (Number.isNaN(lowNum) || Number.isNaN(highNum)) continue
      if (lowStreet !== baseStreet || highStreet !== baseStreet) continue
      if (baseNum >= Math.min(lowNum, highNum) && baseNum <= Math.max(lowNum, highNum)) {
        return r
      }
    }
  }
  return null
}

/**
 * Build the navigation slug for a portfolio property using user_building_ranges
 * data. The matching ubr row's searched_address is what the property page's
 * findApprovedUserRange direct-matches against — so deriving the slug from it
 * guarantees fan-out fires automatically without modal interception. Zip is
 * preserved from the stored portfolio slug. Falls back to the stored slug when
 * no ubr row covers the address.
 */
function buildNavSlug(
  canonical: string,
  storedSlug: string | null,
  ranges: UserBuildingRange[]
): string {
  const baseAddress = stripUnitSuffix(canonical)
  const match = findCoveringRange(baseAddress, ranges)
  if (!match?.searched_address) return storedSlug ?? ''

  const zipMatch = storedSlug?.match(/-(\d{5})$/)
  const zip = zipMatch?.[1] ?? null
  const baseSlug = addressToSlug(match.searched_address)
  return zip ? `${baseSlug}-chicago-${zip}` : baseSlug
}

const COMPLAINT_FIELDS =
  'sr_number, sr_short_code, sr_type, status, created_date, closed_date, ' +
  'created_at, last_modified_date, ' +
  'address, address_normalized, ' +
  'standard_description, complaint_description, complainant_type, unit_number, ' +
  'danger_reported, owner_notified, owner_occupied, ' +
  'concern_category, problem_category, restaurant_name, business_name, ' +
  'sla_target_days, actual_mean_days, estimated_completion, ' +
  'work_order_status, workflow_step, work_order_steps, final_outcome, ' +
  'duplicate, parent_sr_number'

const VIOLATION_FIELDS =
  'violation_id, violation_code, violation_description, violation_inspector_comments, ' +
  'violation_ordinance, violation_status, inspection_status, ' +
  'violation_date, violation_last_modified_date, created_at, ' +
  'inspection_category, department_bureau, inspection_number, ' +
  'is_stop_work_order, address, address_normalized'

const PERMIT_FIELDS =
  'permit_number, permit_type, permit_status, work_description, ' +
  'issue_date, reported_cost, total_fee, created_at, ' +
  'contact_1_name, contact_1_type, address, address_normalized'

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

export type ActivityFeedRow = {
  category: 'complaint' | 'violation' | 'permit'
  id: string
  date: string // sort key — ingest timestamp (created_at)
  ingest_date: string | null // created_at (true UTC, convert to CT for display)
  open_date: string | null // city event date (Chicago-local-as-fake-UTC, or DATE-only)
  last_modified: string | null // 311: closed_date||last_modified_date; violation: violation_last_modified_date; permit: null
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

export type ActivityFeedResult = {
  status: number
  body: Record<string, unknown>
}

/**
 * Build the merged 311/violation/permit activity feed for a portfolio owner.
 * `userId` is whatever portfolio_properties.user_id holds — a Clerk ID for
 * real users, a synthetic ID for demo portfolios.
 *
 * `enabledCodesOverride` replaces the user_sr_preferences lookup when set
 * (demo portfolios fall back to OWNER_RELEVANT_CODES if their prefs rows are
 * missing); when omitted, per-user prefs are read exactly as before.
 */
export async function buildActivityFeed(
  supabase: SupabaseClient,
  userId: string,
  searchParams: URLSearchParams,
  enabledCodesOverride?: Set<string>
): Promise<ActivityFeedResult> {
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

  // Per-user enabled SR codes from user_sr_preferences (the seam). The
  // "building" filter scopes to this set; "other" is its complement.
  const enabledCodes = enabledCodesOverride ?? (await getEnabledCodes(supabase, userId))
  const BUILDING_SR_CODES = Array.from(enabledCodes)

  // Fetch portfolio + approved user_building_ranges in parallel. The ranges
  // are joined in-memory to derive nav slugs that decode to addresses
  // findApprovedUserRange direct-matches on the property page — guaranteeing
  // automatic fan-out without BuildingDetectionModal interception.
  const [propsResult, rangesResult] = await Promise.all([
    supabase
      .from('portfolio_properties')
      .select('id, canonical_address, address_range, additional_streets, slug, community_area, display_name')
      .eq('user_id', userId),
    supabase
      .from('user_building_ranges')
      .select('searched_address, street1_low, street1_high, street2_low, street2_high, street3_low, street3_high, street4_low, street4_high')
      .eq('status', 'approved'),
  ])

  if (propsResult.error) {
    return { status: 500, body: { error: propsResult.error.message } }
  }

  const props = (propsResult.data ?? []) as {
    id: string
    canonical_address: string
    address_range: string | null
    additional_streets: string[] | null
    slug: string | null
    community_area: string | null
    display_name: string | null
  }[]

  const userRanges = (rangesResult.data ?? []) as UserBuildingRange[]

  if (props.length === 0) {
    return { status: 200, body: { items: [], total: 0, limit, offset, has_properties: false } }
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
      // Slug derived from the matching user_building_ranges row's
      // searched_address. canonical_address often carries a unit suffix
      // ("6030 N SHERIDAN RD 102") that doesn't appear in user_building_ranges
      // — the ubr row's searched_address is "6030 N SHERIDAN RD". Using that
      // for the slug ensures findApprovedUserRange direct-matches on arrival.
      slug: buildNavSlug(p.canonical_address, p.slug, userRanges),
      community_area: p.community_area,
    }
    for (const addr of getAllAddresses(p.canonical_address, p.address_range, p.additional_streets)) {
      addressToProperty.set(addr, meta)
    }
  }

  const allAddresses = Array.from(addressToProperty.keys())
  if (allAddresses.length === 0) {
    return { status: 200, body: { items: [], total: 0, limit, offset, has_properties: true } }
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
    return { status: 500, body: { error: complaintsErr } }
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
    return { status: 500, body: { error: violationsErr } }
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
    return { status: 500, body: { error: permitsErr } }
  }

  // ── Normalize complaints ───────────────────────────────────────────────
  const complaintRows = ((complaints ?? []) as unknown as ComplaintRow[])
    .map((c) => {
      const addrKey = String(c.address_normalized ?? '')
      const meta = addressToProperty.get(addrKey)
      if (!meta) return null
      const status = String(c.status ?? '').toLowerCase()
      const normalizedStatus: ActivityFeedRow['status'] = status === 'open' ? 'open' : 'closed'
      const cIngest = (c as { created_at?: string | null }).created_at ?? null
      const cClosed = (c as { closed_date?: string | null }).closed_date ?? null
      const cLastMod = (c as { last_modified_date?: string | null }).last_modified_date ?? null
      return {
        category: 'complaint' as const,
        id: c.sr_number ? String(c.sr_number) : `complaint-${addrKey}-${c.created_date}`,
        date: String(cIngest ?? c.created_date ?? ''),
        ingest_date: cIngest,
        open_date: (c.created_date ?? null) as string | null,
        // Hybrid: closed_date when the complaint is closed, else city's last_modified_date.
        last_modified: normalizedStatus === 'closed' ? (cClosed ?? cLastMod) : cLastMod,
        display_type: c.sr_type ? String(c.sr_type) : 'Complaint',
        status: normalizedStatus,
        property_id: meta.id,
        property_address: meta.address,
        property_slug: meta.slug,
        community_area: meta.community_area,
        complaint: c,
      } satisfies ActivityFeedRow
    })
    .filter((r) => r !== null && !!r.date) as ActivityFeedRow[]

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
      const vIngest = (g.first as { created_at?: string | null }).created_at ?? null
      const vLastMod = (g.first as { violation_last_modified_date?: string | null }).violation_last_modified_date ?? null
      return {
        category: 'violation' as const,
        id: String(g.first.inspection_number ?? g.first.violation_id ?? `violation-${addrKey}-${g.first.violation_date}`),
        date: String(vIngest ?? g.first.violation_date ?? ''),
        ingest_date: vIngest,
        open_date: (g.first.violation_date ?? null) as string | null,
        last_modified: vLastMod,
        display_type: label,
        status: g.isOpen ? 'open' : 'closed',
        property_id: meta.id,
        property_address: meta.address,
        property_slug: meta.slug,
        community_area: meta.community_area,
        violations: g.sources,
      } satisfies ActivityFeedRow
    })
    .filter((r) => r !== null && !!r.date) as ActivityFeedRow[]

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
      const pIngest = (p as { created_at?: string | null }).created_at ?? null
      return {
        category: 'permit' as const,
        id: p.permit_number ? String(p.permit_number) : `permit-${addrKey}-${p.issue_date}`,
        date: String(pIngest ?? p.issue_date ?? ''),
        ingest_date: pIngest,
        open_date: (p.issue_date ?? null) as string | null,
        last_modified: null,
        display_type: label,
        status: null,
        property_id: meta.id,
        property_address: meta.address,
        property_slug: meta.slug,
        community_area: meta.community_area,
        permit: p,
      } satisfies ActivityFeedRow
    })
    .filter((r) => r !== null && !!r.date) as ActivityFeedRow[]

  // ── Merge + sort ───────────────────────────────────────────────────────
  const merged = [...complaintRows, ...violationRows, ...permitRows].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const total = merged.length
  const items = merged.slice(offset, offset + limit)

  return {
    status: 200,
    body: {
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
    },
  }
}
