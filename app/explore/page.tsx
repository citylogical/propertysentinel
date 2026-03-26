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

  if (!subscriber || !['admin', 'approved'].includes(subscriber.role)) {
    return (
      <div className="explore-page">
        <PropertyNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
        <div className="explore-denied">
          <div className="explore-denied-icon">⛔</div>
          <div className="explore-denied-title">Access Restricted</div>
          <div className="explore-denied-sub">
            This tool requires approval. Contact the administrator to request access.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="explore-page">
      <PropertyNav apiKey={process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY} />
      <ExploreClient />
    </div>
  )
}