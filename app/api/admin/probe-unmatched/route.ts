import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeAddress, fetchProperty, fetchSiblingPins } from '@/lib/supabase-search'

// 16 buildings the naive diagnostic SQL flagged as no exact match and no condo-prefix match.
// We re-resolve them through the production stack (fetchProperty's 5 tiers + fetchSiblingPins'
// 4 paths) to see which ones the manual save flow would actually find.
const UNMATCHED_RAW = [
  '10111 S. Yates Blvd.',
  '10126 S. Yates Blvd.',
  '10232 S. Yates Blvd.',
  '10240 S. Yates Blvd.',
  '11347 S King Dr',
  '1540 N La Salle Dr',
  '235 Van Buren St',
  '3515-17 S Lituanica Ave',
  '4221 N St Louis Ave',
  '4652 N St Louis Ave',
  '5071 N Northwest Hwy',
  '6242 S Greenwood Ave',
  '7648 S King Dr',
  '9008 S. Crandon Ave.',
  '9530 S. Yates Blvd.',
  '9822 S. Yates Blvd.',
]

export async function GET() {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  
    // Localhost diagnostic only — admin check disabled in dev so we can probe
  // without a subscribers row. Production deploy will refuse the request.
  if (process.env.NODE_ENV !== 'development') {
    const supabase = getSupabaseAdmin()
    const { data: subscriber } = await supabase
      .from('subscribers')
      .select('role')
      .eq('clerk_id', userId)
      .maybeSingle()
    if (subscriber?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const results = await Promise.all(
    UNMATCHED_RAW.map(async (raw) => {
      const normalized = normalizeAddress(raw)
      const propertyResult = await fetchProperty(normalized)
      const { property, nearestParcel } = propertyResult

      let siblings: Awaited<ReturnType<typeof fetchSiblingPins>> | null = null
      if (property?.pin && property.address_normalized) {
        siblings = await fetchSiblingPins(property.pin, property.address_normalized)
      }

      return {
        raw,
        normalized,
        resolved: property
          ? {
              status: 'matched' as const,
              pin: property.pin,
              address: property.address_normalized,
              zip: property.zip,
              property_class: property.property_class,
              ward: property.ward,
              community_area: property.community_area,
              mailing_name: property.mailing_name,
            }
          : nearestParcel
          ? {
              status: 'nearest_only' as const,
              nearest_pin: nearestParcel.pin,
              nearest_address: nearestParcel.address_normalized,
              distance: nearestParcel._nearestDist,
              note: 'Tier 3 fallback — review carefully before importing',
            }
          : { status: 'no_match' as const },
        siblings: siblings
          ? {
              pin_count: siblings.siblingPins.length,
              address_count: siblings.siblingAddresses.length,
              address_range: siblings.addressRange,
              resolved_via: siblings.resolvedVia,
              first_few_addresses: siblings.siblingAddresses.slice(0, 5),
            }
          : null,
        error: propertyResult.error,
      }
    })
  )

  const summary = {
    total: results.length,
    matched: results.filter((r) => r.resolved.status === 'matched').length,
    nearest_only: results.filter((r) => r.resolved.status === 'nearest_only').length,
    no_match: results.filter((r) => r.resolved.status === 'no_match').length,
  }

  return NextResponse.json({ summary, results })
}