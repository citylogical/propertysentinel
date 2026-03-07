import { NextRequest, NextResponse } from 'next/server'
import { normalizeAddress, fetchComplaints } from '@/lib/supabase-search'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }
  const normalized = normalizeAddress(address)
  const result = await fetchComplaints(normalized)
  return NextResponse.json(result)
}