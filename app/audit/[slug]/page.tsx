import type { Metadata } from 'next'
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

  const { data: properties } = await supabase
    .from('portfolio_audit_properties')
    .select('*')
    .eq('audit_id', audit.id)
    .order('canonical_address')

  return <AuditView audit={audit as Record<string, unknown>} properties={properties ?? []} />
}
