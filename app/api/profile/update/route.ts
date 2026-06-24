import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { computeEntitlement } from '@/lib/entitlement'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('subscribers')
    .select('email, first_name, last_name, organization, phone, zip, plan, role, created_at, subscription_status, trial_started_at, lifetime_saves')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const entitlement = computeEntitlement(
    data
      ? {
          plan: data.plan ?? null,
          subscription_status: (data as { subscription_status?: string | null }).subscription_status ?? null,
          trial_started_at: (data as { trial_started_at?: string | null }).trial_started_at ?? null,
        }
      : null
  )

  return NextResponse.json({
    profile: data,
    entitlement,
    lifetime_saves: Number((data as { lifetime_saves?: number | null } | null)?.lifetime_saves ?? 0),
  })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const first_name = typeof body.first_name === 'string' ? body.first_name : ''
  const last_name = typeof body.last_name === 'string' ? body.last_name : ''
  const organization = typeof body.organization === 'string' ? body.organization : ''
  const phone = typeof body.phone === 'string' ? body.phone : ''
  const zip = typeof body.zip === 'string' ? body.zip : ''

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const row = {
    first_name: first_name.trim() || null,
    last_name: last_name.trim() || null,
    organization: organization.trim() || null,
    phone: phone.trim() || null,
    zip: zip.trim() || null,
    updated_at: now,
  }

  const { data: existing } = await supabase.from('subscribers').select('id').eq('clerk_id', userId).maybeSingle()

  if (existing) {
    const { error } = await supabase.from('subscribers').update(row).eq('clerk_id', userId)
    if (error) {
      console.error('Profile update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const user = await currentUser()
    const email = user?.emailAddresses?.[0]?.emailAddress?.trim() ?? ''
    if (!email) {
      return NextResponse.json({ error: 'Account email is required to create subscriber record' }, { status: 400 })
    }
    const { error } = await supabase.from('subscribers').insert({
      clerk_id: userId,
      email,
      ...row,
      plan: 'free',
      created_at: now,
    })
    if (error) {
      console.error('Profile insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
