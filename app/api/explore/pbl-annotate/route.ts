import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', userId)
    .single()

  if (!subscriber || !['admin', 'approved'].includes(subscriber.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: {
    listing_id: number
    flag?: string | null
    verified_address?: string | null
    notes?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { listing_id, flag, verified_address, notes } = body

  if (!listing_id || !Number.isFinite(listing_id)) {
    return NextResponse.json({ error: 'Invalid listing_id' }, { status: 400 })
  }

  if (flag && !['yes', 'maybe', 'no'].includes(flag)) {
    return NextResponse.json({ error: 'Invalid flag value' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('airbnb_annotations')
    .upsert(
      {
        listing_id,
        flag: flag || null,
        verified_address: verified_address || null,
        notes: notes || null,
        annotated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'listing_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('[pbl-annotate] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}