import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import DashboardEmptyState from '../DashboardEmptyState'
import ActivityFeedClient from './ActivityFeedClient'

export const metadata: Metadata = {
  title: 'Property Sentinel — Activity Feed',
  alternates: {
    canonical: '/dashboard/activity',
  },
}

export default async function ActivityPage() {
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
    return <DashboardEmptyState kind="signed_out" context="activity" />
  }

  return <ActivityFeedClient isAdmin={isAdmin} />
}
