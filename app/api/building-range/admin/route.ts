import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const { userId } = await auth()
  if (!userId) return null
  const supabase = getSupabase()
  const { data } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', userId)
    .single()
  if (data?.role !== 'admin') return null
  return userId
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabase()
  const { data } = await supabase
    .from('user_building_ranges')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json({ ranges: data ?? [] })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, status, admin_notes } = await req.json()
  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('user_building_ranges')
    .update({
      status,
      reviewed_by: admin,
      reviewed_at: new Date().toISOString(),
      admin_notes: admin_notes || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ range: data })
}
