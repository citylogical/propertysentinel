import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function isSubscriberAdmin(subscriber: Record<string, unknown> | null | undefined): boolean {
  if (!subscriber) return false
  if (subscriber.is_admin === true) return true
  const role = subscriber.role != null ? String(subscriber.role) : ''
  return role === 'admin'
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('is_admin, role')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (!isSubscriberAdmin(subscriber as Record<string, unknown> | null)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const audit_id = typeof body.audit_id === 'string' ? body.audit_id : ''
  if (!audit_id) {
    return NextResponse.json({ error: 'Missing audit_id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('portfolio_audits')
    .update({ is_active: false })
    .eq('id', audit_id)
    .eq('created_by', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
