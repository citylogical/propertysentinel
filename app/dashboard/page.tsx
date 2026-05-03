import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import PortfolioTable from './PortfolioTable'

export const metadata: Metadata = {
  title: 'Property Sentinel — Dashboard',
  alternates: {
    canonical: '/dashboard',
  },
}

export default async function DashboardPage() {
  const { userId } = await auth()

  // Server-side admin check — mirrors the audit page pattern. Defaults to false
  // for logged-out viewers and any non-admin user.
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

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content">
          {userId ? (
            <PortfolioTable isAdmin={isAdmin} />
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 24px', color: '#8a94a0' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#0f2744', marginBottom: 8 }}>
                No saved properties yet
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                Search for a Chicago address and click the bookmark icon to save it to your dashboard.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
