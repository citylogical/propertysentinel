import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Target = { label: string; lat: number; lng: number }

// Best-guess coords from Chicago grid math. If a result looks wrong (high distance,
// wrong neighborhood), grab real coords from Google Maps and replace.
const TARGETS: Target[] = [
  { label: '11347 S King Dr (60628, Roseland)',     lat: 41.687691, lng: -87.612933 },
  { label: '7648 S King Dr (60619, Chatham)',       lat: 41.685832, lng: -87.61317 },
  { label: '3515 S Lituanica Ave (60608, Bridgeport)', lat: 41.88072, lng: -87.514292 },
]

const BBOX_DELTA = 0.0008  // ~80m at Chicago latitude

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const supabase = getSupabaseAdmin()

  const results = await Promise.all(
    TARGETS.map(async (t) => {
      // Bounding box query on parcel_universe (which has lat/lng for ~all PINs)
      const { data: parcels, error: parcelError } = await supabase
        .from('parcel_universe')
        .select('pin, lat, lng, class, ward, community_area_name, township_name, tax_year')
        .gte('lat', t.lat - BBOX_DELTA)
        .lte('lat', t.lat + BBOX_DELTA)
        .gte('lng', t.lng - BBOX_DELTA)
        .lte('lng', t.lng + BBOX_DELTA)
        .order('tax_year', { ascending: false })
        .limit(40)

      if (parcelError) {
        return { target: t.label, error: parcelError.message, candidates: [] }
      }

      // Rank by Euclidean distance, dedupe by PIN (parcel_universe has multiple tax years)
      const seen = new Set<string>()
      const ranked = (parcels ?? [])
        .map((p) => {
          const lat = p.lat != null ? Number(p.lat) : NaN
          const lng = p.lng != null ? Number(p.lng) : NaN
          const dist = Number.isFinite(lat) && Number.isFinite(lng)
            ? Math.sqrt((lat - t.lat) ** 2 + (lng - t.lng) ** 2)
            : Infinity
          return { ...p, _dist: dist }
        })
        .filter((p) => {
          if (!p.pin || seen.has(p.pin)) return false
          seen.add(p.pin)
          return true
        })
        .sort((a, b) => a._dist - b._dist)
        .slice(0, 5)

      // For each top candidate, look it up in properties to see how it's stored (if at all)
      const enriched = await Promise.all(
        ranked.map(async (p) => {
          const { data: propRow } = await supabase
            .from('properties')
            .select('pin, address_normalized, zip, mailing_name, property_class')
            .eq('pin', p.pin)
            .maybeSingle()
          return {
            pin: p.pin,
            distance_meters_approx: Math.round(p._dist * 111000),
            parcel_class: p.class,
            parcel_ward: p.ward,
            parcel_community: p.community_area_name,
            parcel_township: p.township_name,
            in_properties_table: propRow != null,
            properties_address: propRow?.address_normalized ?? null,
            properties_zip: propRow?.zip ?? null,
            properties_mailing: propRow?.mailing_name ?? null,
            properties_class: propRow?.property_class ?? null,
          }
        })
      )

      return { target: t.label, candidates: enriched }
    })
  )

  return NextResponse.json({ results })
}