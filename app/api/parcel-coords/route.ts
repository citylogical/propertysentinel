import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const pin = searchParams.get('pin')
  if (!pin?.trim()) {
    return NextResponse.json({ lat: null, lng: null })
  }

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('parcel_universe')
    .select('lat, lng')
    .eq('pin', pin.trim())
    .order('tax_year', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    lat: data?.lat != null ? Number(data.lat) : null,
    lng: data?.lng != null ? Number(data.lng) : null,
  })
}
