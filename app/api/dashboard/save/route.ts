import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Saved-state check for the address page. The old POST handler (direct save
// with the 3-property lifetime cap and first-save trial stamp) was retired
// by the activation flow: properties now enter the portfolio only through
// staging (/api/dashboard/stage) → commit/checkout → promotion. Keeping a
// POST here would be an unpriced side door into the portfolio.

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ saved: false })
  }

  const { searchParams } = new URL(request.url)
  const canonicalAddress = searchParams.get('canonical_address')

  if (!canonicalAddress) {
    return NextResponse.json({ saved: false })
  }

  const supabase = getSupabaseAdmin()

  // Match a saved property when EITHER the canonical_address matches exactly
  // (saved-from-the-same-page case) OR the saved property's address_range
  // covers this address (saved-from-different-address-in-same-building case).
  //
  // address_range is stored as "START-END N STREET NAME" (e.g. "536-548 N LAKE SHORE DR").
  // We need to determine if the searched address falls within START..END for the
  // same street. Doing this purely in SQL is awkward, so fetch candidates by
  // (1) exact canonical match (fast path), and (2) street-name-match where the
  // range covers the searched number, then filter in app code.

  // Parse "<number> <prefix> <street name>" from the searched address. The
  // canonical addresses we store are uppercase like "540 N LAKE SHORE DR".
  const upperAddr = canonicalAddress.toUpperCase().trim()
  const addrMatch = upperAddr.match(/^(\d+)\s+(.+?)(?:\s+(?:UNIT|APT|#)\s*[\w-]+)?$/)
  const searchedNumber = addrMatch ? parseInt(addrMatch[1], 10) : NaN
  const searchedStreet = addrMatch ? addrMatch[2].trim() : ''

  // Build candidate query: exact canonical OR any row on this street that has an
  // address_range. Filtering by street keeps the candidate set small per user.
  let query = supabase
    .from('portfolio_properties')
    .select('id, display_name, alerts_enabled, canonical_address, address_range, additional_streets')
    .eq('user_id', userId)

  if (Number.isFinite(searchedNumber) && searchedStreet) {
    // Match exact canonical OR street-name overlap (broad; filtered below)
    query = query.or(
      `canonical_address.eq.${upperAddr},canonical_address.ilike.%${searchedStreet}%,address_range.ilike.%${searchedStreet}%,additional_streets.cs.{${searchedStreet}}`
    )
  } else {
    query = query.eq('canonical_address', upperAddr)
  }

  const { data: candidates } = await query

  // If we got an exact canonical match, use it. Otherwise check ranges.
  let match: { id: string; display_name: string | null; alerts_enabled: boolean | null } | null =
    null

  if (candidates && candidates.length > 0) {
    // 1. Exact canonical match wins
    const exact = candidates.find((c) => c.canonical_address === upperAddr)
    if (exact) {
      match = exact
    } else if (Number.isFinite(searchedNumber)) {
      // 2. Range match: searched number falls within stored range on same street
      for (const c of candidates) {
        const range = c.address_range
        if (!range) continue
        // Parse "START-END PREFIX STREET" — e.g. "536-548 N LAKE SHORE DR"
        const m = range.match(/^(\d+)-(\d+)\s+(.+)$/)
        if (!m) continue
        const start = parseInt(m[1], 10)
        const end = parseInt(m[2], 10)
        const rangeStreet = m[3].trim().toUpperCase()
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          rangeStreet === searchedStreet &&
          searchedNumber >= start &&
          searchedNumber <= end
        ) {
          match = c
          break
        }
        // 3. Also check additional_streets[] for the same coverage logic
        if (Array.isArray(c.additional_streets)) {
          for (const addl of c.additional_streets) {
            const am = String(addl).match(/^(\d+)-(\d+)\s+(.+)$/)
            if (!am) continue
            const aStart = parseInt(am[1], 10)
            const aEnd = parseInt(am[2], 10)
            const aStreet = am[3].trim().toUpperCase()
            if (
              Number.isFinite(aStart) &&
              Number.isFinite(aEnd) &&
              aStreet === searchedStreet &&
              searchedNumber >= aStart &&
              searchedNumber <= aEnd
            ) {
              match = c
              break
            }
          }
          if (match) break
        }
      }
    }
  }

  return NextResponse.json({
    saved: !!match,
    portfolio_id: match?.id ?? null,
    display_name: match?.display_name ?? null,
    alerts_enabled: match?.alerts_enabled ?? false,
  })
}
