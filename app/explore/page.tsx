import { currentUser } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ExploreClient from './ExploreClient'
import PropertySidebar from '@/components/PropertySidebar'
import './explore.css'

export const metadata = {
  title: 'Property Sentinel — Explore',
  description: 'Data Explorer and Lead Management.',
}

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export default async function ExplorePage() {
  const user = await currentUser()
  if (!user) redirect('/')

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase.from('subscribers').select('role').eq('clerk_id', user.id).single()

  if (!subscriber || !['admin', 'approved'].includes(subscriber.role as string)) {
    redirect('/')
  }

  return (
    <div className="address-page explore-page-stack">
      <div className="prop-page-shell">
        <PropertySidebar initialTab="explore" />
        <div className="prop-main-content explore-page-main">
          <div className="address-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="address-header-street">Explore</div>
              <div className="address-header-meta">Tables & leads</div>
            </div>
          </div>
          <ExploreClient />
        </div>
      </div>
    </div>
  )
}
