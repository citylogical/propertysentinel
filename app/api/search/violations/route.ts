import { NextRequest, NextResponse } from 'next/server'
import { normalizeAddress, fetchViolationsWithTimeout } from '@/lib/socrata-search'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }
  const normalized = normalizeAddress(address)
  const result = await fetchViolationsWithTimeout(normalized)
  return NextResponse.json(result)
}
