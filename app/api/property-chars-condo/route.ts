import { NextRequest, NextResponse } from 'next/server'
import { fetchPropertyCharsCondo } from '@/lib/supabase-search'

/**
 * GET ?pin=14-digit — latest property_chars_condo row for the PIN,
 * excluding parking / common-area rows (same filters as fetchPropertyCharsCondo).
 */
export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get('pin')
  if (!pin || String(pin).trim() === '') {
    return NextResponse.json({ error: 'pin required', chars: null }, { status: 400 })
  }
  const { chars, error } = await fetchPropertyCharsCondo(pin)
  if (error) {
    return NextResponse.json({ error, chars: null }, { status: 500 })
  }
  return NextResponse.json({ chars, error: null })
}
