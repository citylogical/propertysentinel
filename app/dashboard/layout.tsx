import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import DashboardLayoutClient from './DashboardLayoutClient'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth()

  let propertyCount = 0
  if (userId) {
    try {
      const supabase = getSupabaseAdmin()
      const { count } = await supabase
        .from('portfolio_properties')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      propertyCount = count ?? 0
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
        <DashboardLayoutClient propertyCount={propertyCount} today={today}>
          {children}
        </DashboardLayoutClient>
      </div>
    </div>
  )
}
