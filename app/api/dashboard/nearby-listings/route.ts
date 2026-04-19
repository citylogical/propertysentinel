import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const AIRBNB_SELECT =
  'id, host_name, property_type, price, license, is_potentially_noncompliant, number_of_reviews, host_listings_count, listing_url, latitude, longitude'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  const latDelta = 0.00135
  const lngDelta = 0.00185
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('airbnb_listings')
    .select(AIRBNB_SELECT)
    .gte('latitude', lat - latDelta)
    .lte('latitude', lat + latDelta)
    .gte('longitude', lng - lngDelta)
    .lte('longitude', lng + lngDelta)
    .order('number_of_reviews', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[nearby-listings]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
