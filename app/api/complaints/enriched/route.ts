import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SELECT_FIELDS =
  'sr_number, sr_short_code, sr_type, status, created_date, ' +
  'complaint_description, complainant_type, unit_number, ' +
  'danger_reported, owner_notified, owner_occupied, ' +
  'concern_category, restaurant_name, business_name, problem_category, ' +
  'sla_target_days, actual_mean_days, estimated_completion, ' +
  'work_order_status, workflow_step, enriched_at'

export async function GET(request: Request) {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: subscriber } = await supabaseAdmin
    .from('subscribers')
    .select('role')
    .eq('clerk_id', user.id)
    .maybeSingle()
  const subRole = (subscriber as { role?: string | null } | null)?.role != null
    ? String((subscriber as { role?: string | null }).role)
    : ''
  if (!subscriber || !['admin', 'approved'].includes(subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const supabase = supabaseAdmin
  const { data, error } = await supabase
    .from('complaints_311')
    .select(SELECT_FIELDS)
    .eq('address_normalized', address)
    .not('enriched_at', 'is', null)
    .not('complaint_description', 'is', null)
    .order('created_date', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
