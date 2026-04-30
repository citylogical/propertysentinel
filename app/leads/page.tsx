import type { Metadata } from 'next'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import LeadsClient from './LeadsClient'

export const metadata: Metadata = {
  title: '311 Service Leads — Property Sentinel',
  description: 'Recent 311 complaints by trade category. Unlock contact info to claim a lead.',
  alternates: {
    canonical: '/leads',
  },
}

// Leads is parked in development — admin-only access until further notice.
// Non-admins (signed-out, signed-in non-admin, missing subscriber row) get
// redirected to the homepage. Admin gate uses subscribers.role, NOT Clerk
// publicMetadata, matching the pattern used by /api/profile/role and the
// dashboard/audit routes.
export default async function LeadsPage() {
  const user = await currentUser()
  if (!user) redirect('/')

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', user.id)
    .maybeSingle()

  const role = (subscriber as { role?: string | null } | null)?.role
  if (role !== 'admin') redirect('/')

  return <LeadsClient />
}
