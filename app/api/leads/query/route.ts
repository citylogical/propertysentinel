import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type QueryBody = {
  mode?: string
  codes?: string[]
  days?: number
  neighborhoods?: string[]
  page?: number
  pageSize?: number
}

function streetNameFromNormalized(addr: string): string {
  const parts = addr.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return addr
  return parts.slice(1).join(' ')
}

export async function POST(req: NextRequest) {
  let body: QueryBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  if (body.mode === 'neighborhoods') {
    const { data, error } = await supabase.from('complaints_311').select('community_area').not('community_area', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const set = new Set<string>()
    for (const row of data ?? []) {
      const a = (row as { community_area?: string | null }).community_area
      if (a) set.add(a)
    }
    return NextResponse.json({ neighborhoods: [...set].sort((a, b) => a.localeCompare(b)) })
  }

  const codes = body.codes ?? []
  if (codes.length === 0) {
    return NextResponse.json({ leads: [], total: 0 })
  }

  const days = body.days ?? 14
  const page = Math.max(1, body.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, body.pageSize ?? 25))
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 19)

  let query = supabase
    .from('complaints_311')
    .select('sr_number, sr_type, sr_short_code, address_normalized, community_area, ward, created_date, status', {
      count: 'exact',
    })
    .in('sr_short_code', codes)
    .gte('created_date', sinceStr)
    .order('created_date', { ascending: false })

  const neighborhoods = body.neighborhoods
  if (neighborhoods && neighborhoods.length > 0) {
    query = query.in('community_area', neighborhoods)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leads = (data ?? []).map((row: Record<string, unknown>) => {
    const addr = String(row.address_normalized ?? '')
    return {
      ...row,
      street_name: streetNameFromNormalized(addr),
    }
  })

  return NextResponse.json({ leads, total: count ?? 0 })
}
