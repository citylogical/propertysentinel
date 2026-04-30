import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EXPLORE_TABLES, isValidTable, isValidColumn } from '@/lib/explore-tables'
import { auth } from '@clerk/nextjs/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type SortItem = { id: string; desc: boolean }
type FilterItem = { id: string; value: string }

type QueryRequest = {
  table: string
  columns: string[]
  pageIndex: number
  pageSize: number
  sorting: SortItem[]
  filters: FilterItem[]
}

export async function POST(req: NextRequest) {
  // ── Auth gate ──────────────────────────────────────────────────────────
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Check role
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', userId)
    .single()

  if (!subscriber || !['admin', 'approved'].includes(subscriber.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let body: QueryRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { table, columns, pageIndex, pageSize, sorting, filters } = body

  // ── Validate table ─────────────────────────────────────────────────────
  if (!table || !isValidTable(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const tableDef = EXPLORE_TABLES[table]

  // ── Validate columns ───────────────────────────────────────────────────
  const safeCols = (columns ?? []).filter((c) => isValidColumn(table, c))
  if (safeCols.length === 0) {
    // Fall back to all columns
    safeCols.push(...tableDef.columns.map((c) => c.key))
  }

  const selectStr = safeCols.join(',')

  // ── Validate page size ─────────────────────────────────────────────────
  const safePageSize = Math.min(Math.max(pageSize || 50, 10), 200)
  const safePageIndex = Math.max(pageIndex || 0, 0)
  const offset = safePageIndex * safePageSize

  // ── Build query ────────────────────────────────────────────────────────
  /**
   * For views, PostgREST's `estimated` count uses the underlying table's
   * pg_class.reltuples and ignores the view's WHERE clause. That's why
   * `enriched_complaints` was returning 13.4M instead of ~1929.
   *
   * Allowlist views here. With the partial index on
   * (created_date DESC) WHERE enriched_at IS NOT NULL, exact COUNT(*)
   * on this view is sub-millisecond.
   */
  const EXACT_COUNT_TABLES = new Set(['enriched_complaints'])
  const countStrategy: 'estimated' | 'exact' = EXACT_COUNT_TABLES.has(table) ? 'exact' : 'estimated'

  let query = supabase
    .from(table)
    .select(selectStr, { count: countStrategy })

  // Apply filters
  const safeFilters = (filters ?? []).filter(
    (f) => f.value && f.value.trim() !== '' && isValidColumn(table, f.id)
  )

  /**
   * Indexed-column allowlist for large tables. For these (table, column)
   * pairs, the query route uses prefix or exact match instead of
   * `ilike '%val%'` so the existing B-tree indexes are actually used.
   *
   * complaints_311 is 13.4M rows; without this every text filter caused
   * a sequential scan and Vercel timeout. Same logic carries over to the
   * `enriched_complaints` view (~1.9K rows today, but grows with Worker A).
   */
  const PREFIX_INDEXED_COLUMNS: Record<string, string[]> = {
    complaints_311: ['address_normalized', 'pin'],
    enriched_complaints: ['address_normalized', 'pin'],
    properties: ['address_normalized', 'pin'],
    violations: ['address_normalized', 'pin'],
    permits: ['address_normalized', 'pin'],
    parcel_universe: ['pin'],
    assessed_values: ['pin'],
    property_chars_residential: ['pin'],
    property_chars_condo: ['pin'],
    property_chars_commercial: ['pin'],
    property_tax_exempt: ['pin'],
  }
  const EXACT_INDEXED_COLUMNS: Record<string, string[]> = {
    complaints_311: ['sr_number', 'sr_short_code'],
    enriched_complaints: ['sr_number', 'sr_short_code'],
    permits: ['permit_number'],
    violations: ['violation_id'],
  }

  for (const f of safeFilters) {
    const col = tableDef.columns.find((c) => c.key === f.id)
    if (!col) continue

    const val = f.value.trim()

    if (col.type === 'text') {
      const prefixCols = PREFIX_INDEXED_COLUMNS[table] ?? []
      const exactCols = EXACT_INDEXED_COLUMNS[table] ?? []
      if (exactCols.includes(f.id)) {
        // SR numbers, permit numbers, codes are unique or short-domain.
        // Match exactly (case-insensitive) — uses the unique B-tree index.
        query = query.ilike(f.id, val)
      } else if (prefixCols.includes(f.id)) {
        // Address and PIN searches are always typed left-to-right.
        // `ilike 'val%'` uses the B-tree index; `ilike '%val%'` would not.
        query = query.ilike(f.id, `${val}%`)
      } else {
        // Default behavior for small tables / unindexed text columns.
        query = query.ilike(f.id, `%${val}%`)
      }
    } else if (col.type === 'number') {
      // Support operators: >100, <50, >=200, <=300, 100-200 (range), or exact
      if (val.includes('-') && !val.startsWith('-')) {
        const [lo, hi] = val.split('-').map(Number)
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          query = query.gte(f.id, lo).lte(f.id, hi)
        }
      } else if (val.startsWith('>=')) {
        const n = Number(val.slice(2))
        if (Number.isFinite(n)) query = query.gte(f.id, n)
      } else if (val.startsWith('<=')) {
        const n = Number(val.slice(2))
        if (Number.isFinite(n)) query = query.lte(f.id, n)
      } else if (val.startsWith('>')) {
        const n = Number(val.slice(1))
        if (Number.isFinite(n)) query = query.gt(f.id, n)
      } else if (val.startsWith('<')) {
        const n = Number(val.slice(1))
        if (Number.isFinite(n)) query = query.lt(f.id, n)
      } else {
        const n = Number(val)
        if (Number.isFinite(n)) query = query.eq(f.id, n)
      }
    } else if (col.type === 'date') {
      // Support: YYYY-MM-DD exact, or >YYYY-MM-DD, <YYYY-MM-DD
      if (val.startsWith('>')) {
        query = query.gte(f.id, val.slice(1).trim())
      } else if (val.startsWith('<')) {
        query = query.lte(f.id, val.slice(1).trim())
      } else {
        // Prefix match for dates — allows filtering by year or year-month
        query = query.gte(f.id, val).lt(f.id, val + '\uffff')
      }
    } else if (col.type === 'boolean') {
      const lower = val.toLowerCase()
      if (lower === 'true' || lower === 'yes' || lower === '1') {
        query = query.eq(f.id, true)
      } else if (lower === 'false' || lower === 'no' || lower === '0') {
        query = query.eq(f.id, false)
      }
    }
  }

  // Apply sorting
  const safeSorting = (sorting ?? []).filter((s) => isValidColumn(table, s.id))
  if (safeSorting.length > 0) {
    for (const s of safeSorting) {
      query = query.order(s.id, { ascending: !s.desc })
    }
  } else {
    query = query.order(tableDef.defaultSort, {
      ascending: !tableDef.defaultSortDesc,
    })
  }

  // Apply pagination
  query = query.range(offset, offset + safePageSize - 1)

  // ── Execute ────────────────────────────────────────────────────────────
  const { data, count, error } = await query

  if (error) {
    console.error('[explore/query] Supabase error:', error.message)
    return NextResponse.json(
      { error: error.message, data: [], totalRows: 0, pageCount: 0 },
      { status: 500 }
    )
  }

  const totalRows = count ?? 0
  const pageCount = Math.ceil(totalRows / safePageSize)

  return NextResponse.json({
    data: data ?? [],
    totalRows,
    pageCount,
  })
}