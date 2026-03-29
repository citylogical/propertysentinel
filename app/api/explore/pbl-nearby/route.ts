import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: subscriber } = await supabase.from('subscribers').select('role').eq('clerk_id', userId).single()

  if (!subscriber || !['admin', 'approved'].includes(subscriber.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: { lat: number; lng: number; type: 'shvr' | 'airbnb' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { lat, lng, type } = body

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  if (type !== 'shvr' && type !== 'airbnb') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const fnName = type === 'shvr' ? 'get_nearby_shvr' : 'get_nearby_airbnb'
  const radius = type === 'shvr' ? 40 : 150

  const { data, error } = await supabase.rpc(fnName, {
    p_lat: lat,
    p_lng: lng,
    p_radius: radius,
  })

  if (error) {
    console.error('[pbl-nearby] RPC error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
