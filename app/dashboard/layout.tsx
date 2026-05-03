import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import DashboardTabs from './DashboardTabs'

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
        <div className="prop-main-content">
          <div className="dashboard-identity-row">
            <div className="dashboard-identity-left">
              <div className="dashboard-logo">PS</div>
              <div className="dashboard-identity-text">
                <h1>Dashboard</h1>
                <div className="dashboard-identity-sub">
                  {propertyCount} {propertyCount === 1 ? 'property' : 'properties'} · Last 12 months · {today}
                </div>
              </div>
            </div>
          </div>
          <DashboardTabs />
          {children}
        </div>
      </div>
    </div>
  )
}
