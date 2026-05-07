import crypto from 'crypto'
import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import AuditView from './AuditView'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const decoded = decodeURIComponent(slug)
  return {
    title: `Portfolio audit — ${decoded} — Property Sentinel`,
    robots: { index: false, follow: false },
  }
}

export default async function AuditPage({ params }: PageProps) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug).trim().toLowerCase()
  if (!slug) return notFound()

  const supabase = getSupabaseAdmin()

  const { data: audit } = await supabase
    .from('portfolio_audits')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!audit) return notFound()

  if (audit.expires_at && new Date(String(audit.expires_at)) < new Date()) {
    return notFound()
  }

  try {
    const headersList = await headers()
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown'
    const ua = headersList.get('user-agent') || ''
    const visitorHash = crypto
      .createHash('sha256')
      .update(`${ip}|${ua}`)
      .digest('hex')
      .slice(0, 16)

    const { data: existingView } = await supabase
      .from('portfolio_audit_views')
      .select('id, view_count')
      .eq('audit_id', audit.id)
      .eq('visitor_hash', visitorHash)
      .maybeSingle()

    if (existingView) {
      await supabase
        .from('portfolio_audit_views')
        .update({
          view_count: (existingView.view_count ?? 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq('id', existingView.id)
    } else {
      await supabase.from('portfolio_audit_views').insert({
        audit_id: audit.id,
        visitor_hash: visitorHash,
        view_count: 1,
        last_viewed_at: new Date().toISOString(),
      })
    }

    const { count: uniqueCount } = await supabase
      .from('portfolio_audit_views')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', audit.id)

    const { data: totalData } = await supabase.from('portfolio_audit_views').select('view_count').eq('audit_id', audit.id)

    const totalViews = (totalData ?? []).reduce((s: number, r: { view_count?: number | null }) => {
      return s + (r.view_count ?? 0)
    }, 0)

    await supabase
      .from('portfolio_audits')
      .update({
        total_views: totalViews,
        unique_visitors: uniqueCount ?? 0,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', audit.id)
  } catch (trackErr) {
    console.error('Audit view tracking failed:', trackErr)
  }

  const { data: properties } = await supabase
    .from('portfolio_audit_properties')
    .select('*')
    .eq('audit_id', audit.id)
    .order('canonical_address')

  // Optional admin check — `auth()` returns `userId: null` for logged-out viewers,
  // so unauthenticated requests safely fall through to `isAdmin = false`.
  let isAdmin = false
  try {
    const { userId } = await auth()
    console.log('[audit page] auth userId:', userId, 'slug:', slug)
    if (userId) {
      const { data: subscriber, error: subErr } = await supabase
        .from('subscribers')
        .select('role, is_admin, clerk_id, email')
        .eq('clerk_id', userId)
        .maybeSingle()
      console.log('[audit page] subscriber lookup:', {
        subscriber,
        error: subErr?.message,
      })
      // Match the audit/create route's admin check: either role === 'admin' OR is_admin === true
      if (subscriber?.role === 'admin' || subscriber?.is_admin === true) {
        isAdmin = true
      }
    }
    console.log('[audit page] final isAdmin:', isAdmin)
  } catch (e) {
    console.error('[audit page] admin check threw:', e)
  }

  return (
    <AuditView
      audit={audit as Record<string, unknown>}
      properties={properties ?? []}
      isAdmin={isAdmin}
    />
  )
}
