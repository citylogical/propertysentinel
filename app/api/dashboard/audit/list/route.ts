import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function isSubscriberAdmin(subscriber: Record<string, unknown> | null | undefined): boolean {
  if (!subscriber) return false
  if (subscriber.is_admin === true) return true
  const role = subscriber.role != null ? String(subscriber.role) : ''
  return role === 'admin'
}

export async function GET() {
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
    return NextResponse.json({ audits: [] })
  }

  const { data: audits } = await supabase
    .from('portfolio_audits')
    .select(
      'id, slug, pm_company_name, contact_email, expires_at, is_active, created_at, total_views, unique_visitors, last_viewed_at'
    )
    .eq('created_by', userId)
    .order('created_at', { ascending: false })

  const auditIds = (audits ?? []).map((a) => a.id as string)
  let propCounts: { audit_id: string }[] = []
  if (auditIds.length > 0) {
    const { data } = await supabase.from('portfolio_audit_properties').select('audit_id').in('audit_id', auditIds)
    propCounts = (data ?? []) as { audit_id: string }[]
  }

  const countMap: Record<string, number> = {}
  for (const p of propCounts) {
    countMap[p.audit_id] = (countMap[p.audit_id] ?? 0) + 1
  }

  const mapped = (audits ?? []).map((a) => ({
    ...a,
    property_count: countMap[a.id as string] ?? 0,
    is_expired: a.expires_at ? new Date(String(a.expires_at)) < new Date() : false,
    url: `/audit/${a.slug}`,
    total_views: Number(a.total_views ?? 0),
    unique_visitors: Number(a.unique_visitors ?? 0),
    last_viewed_at: (a.last_viewed_at as string | null) ?? null,
  }))

  return NextResponse.json({ audits: mapped })
}
