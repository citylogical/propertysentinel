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
  let query = supabase
    .from(table)
    .select(selectStr, { count: 'estimated' })

  // Apply filters
  const safeFilters = (filters ?? []).filter(
    (f) => f.value && f.value.trim() !== '' && isValidColumn(table, f.id)
  )

  for (const f of safeFilters) {
    const col = tableDef.columns.find((c) => c.key === f.id)
    if (!col) continue

    const val = f.value.trim()

    if (col.type === 'text') {
      query = query.ilike(f.id, `%${val}%`)
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

  // When filters are applied, switch to exact count for accurate pagination
  if (safeFilters.length > 0) {
    query = supabase
      .from(table)
      .select(selectStr, { count: 'exact' })
    // Re-apply filters (rebuild for exact count)
    for (const f of safeFilters) {
      const col = tableDef.columns.find((c) => c.key === f.id)
      if (!col) continue
      const val = f.value.trim()
      if (col.type === 'text') {
        query = query.ilike(f.id, `%${val}%`)
      } else if (col.type === 'number') {
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
        if (val.startsWith('>')) {
          query = query.gte(f.id, val.slice(1).trim())
        } else if (val.startsWith('<')) {
          query = query.lte(f.id, val.slice(1).trim())
        } else {
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