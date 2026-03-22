import { NextRequest, NextResponse } from 'next/server'
import { fetchCommercialChars } from '@/lib/supabase-search'

/**
 * GET ?pin= — property_chars_commercial rows for keypin, ordered tax_year desc.
 * `row` is the first row (latest tax year) for building-level fields on the shared card.
 */
export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get('pin')
  if (!pin || String(pin).trim() === '') {
    return NextResponse.json({ error: 'pin required', row: null, chars: [] }, { status: 400 })
  }
  const { chars, error } = await fetchCommercialChars(pin)
  if (error) {
    return NextResponse.json({ error, row: null, chars: [] }, { status: 500 })
  }
  const list = chars ?? []
  return NextResponse.json({ row: list[0] ?? null, chars: list, error: null })
}
