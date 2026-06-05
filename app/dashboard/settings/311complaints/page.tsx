import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import ComplaintFlowDiagram from './ComplaintFlowDiagram'
import SlideInPanel from './SlideInPanel'

export const metadata: Metadata = {
  title: 'Property Sentinel — Owner-Relevant 311 Complaints',
}

// Server component: determines admin status server-side (never shipped to the
// browser as logic), then passes isAdmin into the client diagram. Admin gating
// matches the rest of the dashboard — role === 'admin', read off subscribers
// by clerk_id, same pattern as the dashboard layout and root redirect.
export default async function ComplaintFlowPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  let isAdmin = false
  try {
    const supabase = getSupabaseAdmin()
    const { data: subscriber } = await supabase
      .from('subscribers')
      .select('role')
      .eq('clerk_id', userId)
      .maybeSingle()
    isAdmin = subscriber?.role === 'admin'
  } catch {
    // Non-fatal: default to non-admin (enrichment hidden) on lookup failure.
  }

  return (
    <div style={{ width: '100%', padding: '20px 32px 40px' }}>
      <SlideInPanel>
        <h1
          style={{
            fontFamily: 'Merriweather, Georgia, serif',
            fontSize: 24,
            fontWeight: 600,
            color: '#1a1a1a',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Owner-relevant 311 complaints
        </h1>
        <div style={{ fontSize: 12, color: '#888', marginTop: 6, marginBottom: 24 }}>
          Every Chicago 311 service-request type, grouped by the department that owns it,
          whether it carries citizen or city liability, and whether it&apos;s something a
          property owner needs to act on. Owner-relevant codes show the enforcement exposure
          and the Municipal Code section behind it.
        </div>
        <ComplaintFlowDiagram isAdmin={isAdmin} />
      </SlideInPanel>
    </div>
  )
}