import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { first_name?: string; last_name?: string; phone?: string; zip?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const user = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress ?? ''

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: existing } = await supabase.from('subscribers').select('id').eq('clerk_id', userId).maybeSingle()

  const payload = {
    clerk_id: userId,
    email: email || undefined,
    first_name: body.first_name ?? null,
    last_name: body.last_name ?? null,
    phone: body.phone ?? null,
    zip: body.zip ?? null,
    updated_at: now,
  }

  if (existing) {
    const { error } = await supabase.from('subscribers').update(payload).eq('clerk_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('subscribers').insert({
      ...payload,
      plan: 'free',
      created_at: now,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
