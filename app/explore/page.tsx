import { currentUser } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ExploreClient from './ExploreClient'
import PropertyNav from '@/app/address/[slug]/PropertyNav'
import './explore.css'

export const metadata = {
  title: 'Property Sentinel — Data Explorer',
  description: 'Browse and filter all Property Sentinel data tables.',
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function ExplorePage() {
  const user = await currentUser()
  if (!user) redirect('/')

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', user.id)
    .single()

  console.log('[explore] clerk user:', user.id, 'subscriber:', subscriber)
  if (!subscriber || !['admin', 'approved'].includes(subscriber.role)) {  
    return (
        <div className="address-page">
          <PropertyNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
          <div className="address-bar">
            <div>
              <div
                className="address-bar-street"
                style={{ fontFamily: '"Merriweather", Georgia, serif', fontSize: '22px', fontWeight: 700, lineHeight: 1.1 }}
              >
                Access Restricted
              </div>
              <div className="address-bar-meta">Data Explorer</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '120px 24px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', color: 'var(--text-dim)', maxWidth: '360px' }}>
                This tool requires approval. Contact the administrator to request access.
              </div>
            </div>
          </div>
        </div>
      )
  }

  return (
    <div className="address-page">
      <PropertyNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
      <div className="address-bar">
        <div>
          <div
            className="address-bar-street"
            style={{ fontFamily: '"Merriweather", Georgia, serif', fontSize: '22px', fontWeight: 700, lineHeight: 1.1 }}
          >
            Data Explorer
          </div>
          <div className="address-bar-meta">All Tables</div>
        </div>
      </div>
      <ExploreClient />
    </div>
  )
}