import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { address?: string; zip?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const address = (body.address ?? '').trim()
  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 })
  }

  const zip = (body.zip ?? '').trim() || null

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('monitored_properties')
    .insert({
      clerk_id: userId,
      address,
      zip,
      status: 'active',
    })
    .select('id, address, zip, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, row: data })
}
