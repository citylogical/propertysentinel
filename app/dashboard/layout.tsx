import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import DashboardLayoutClient from './DashboardLayoutClient'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth()

  let propertyCount = 0
  let isAdmin = false
  if (userId) {
    try {
      const supabase = getSupabaseAdmin()
      const [{ count }, { data: subscriber }] = await Promise.all([
        supabase
          .from('portfolio_properties')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('subscribers')
          .select('role')
          .eq('clerk_id', userId)
          .maybeSingle(),
      ])
      propertyCount = count ?? 0
      isAdmin = subscriber?.role === 'admin'
    } catch {
      // ignore
    }
  }

  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <DashboardLayoutClient propertyCount={propertyCount} today={today} isAdmin={isAdmin}>
          {children}
        </DashboardLayoutClient>
      </div>
    </div>
  )
}
