import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ is_admin: false })
  }

  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('subscribers').select('*').eq('clerk_id', userId).maybeSingle()

  const row = data as { role?: string | null; is_admin?: boolean } | null
  const role = row?.role != null ? String(row.role) : ''
  const is_admin = row?.is_admin === true || role === 'admin'
  return NextResponse.json({ is_admin })
}
