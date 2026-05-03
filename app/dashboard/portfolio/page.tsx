import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import DashboardEmptyState from '../DashboardEmptyState'
import PortfolioTable from '../PortfolioTable'

export const metadata: Metadata = {
  title: 'Property Sentinel — Portfolio',
  alternates: {
    canonical: '/dashboard/portfolio',
  },
}

export default async function PortfolioPage() {
  const { userId } = await auth()

  let isAdmin = false
  if (userId) {
    try {
      const supabase = getSupabaseAdmin()
      const { data: subscriber } = await supabase
        .from('subscribers')
        .select('role')
        .eq('clerk_id', userId)
        .maybeSingle()
      if (subscriber?.role === 'admin') isAdmin = true
    } catch {
      // ignore — fall through to non-admin
    }
  }

  if (!userId) {
    return <DashboardEmptyState kind="signed_out" context="portfolio" />
  }

  return <PortfolioTable isAdmin={isAdmin} />
}
