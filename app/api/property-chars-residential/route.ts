import { NextRequest, NextResponse } from 'next/server'
import { fetchPropertyCharsResidential } from '@/lib/supabase-search'

/**
 * GET ?pin= — latest property_chars_residential row for the PIN (tax_year desc, limit 1).
 */
export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get('pin')
  if (!pin || String(pin).trim() === '') {
    return NextResponse.json({ error: 'pin required', chars: null }, { status: 400 })
  }
  const { chars, error } = await fetchPropertyCharsResidential(pin)
  if (error) {
    return NextResponse.json({ error, chars: null }, { status: 500 })
  }
  return NextResponse.json({ chars, error: null })
}
