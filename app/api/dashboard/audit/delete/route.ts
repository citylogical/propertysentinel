import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('is_admin')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (!subscriber?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const audit_id = typeof body.audit_id === 'string' ? body.audit_id : ''
  const action = typeof body.action === 'string' ? body.action : ''

  if (!audit_id || !action) {
    return NextResponse.json({ error: 'Missing audit_id or action' }, { status: 400 })
  }

  if (action === 'deactivate') {
    const { error } = await supabase
      .from('portfolio_audits')
      .update({ is_active: false })
      .eq('id', audit_id)
      .eq('created_by', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'reactivate') {
    const { error } = await supabase
      .from('portfolio_audits')
      .update({ is_active: true })
      .eq('id', audit_id)
      .eq('created_by', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'delete') {
    const { error } = await supabase.from('portfolio_audits').delete().eq('id', audit_id).eq('created_by', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
