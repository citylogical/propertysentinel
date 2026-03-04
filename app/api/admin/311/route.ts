import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdminToken, getAdminCookieName } from '@/lib/admin-auth'

function soqlEscapeLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function normalizeAddress(raw: string): string {
  let s = raw.trim()
  if (!s) return s
  s = (s.split(',')[0] ?? s).trim()
  s = s.replace(/\s+(apt|apartment|unit|#)\s*.*$/i, '').trim()
  s = s.replace(/\s+/g, ' ').trim()
  return s.toUpperCase()
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get(getAdminCookieName())?.value
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const address = request.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const normalized = normalizeAddress(address)
  const addrUpper = soqlEscapeLiteral(normalized)
  const where = `street_address is not null AND upper(street_address) like '%${addrUpper}%'`

  const baseUrl = 'https://data.cityofchicago.org/resource/v6vf-nfxy.json'
  const params = new URLSearchParams()
  params.set('$where', where)
  params.set('$order', 'created_date DESC')
  params.set('$limit', '50')

  const res = await fetch(`${baseUrl}?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) {
    return NextResponse.json(
      { error: `311 API failed: ${res.status}` },
      { status: 502 }
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}
