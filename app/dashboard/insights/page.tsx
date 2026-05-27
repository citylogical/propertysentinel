import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import InsightsClient from './InsightsClient'

// Server component. Performs the admin gate before rendering any client UI.
// Non-admin users land here, get bounced to /dashboard/portfolio. Mirrors the
// admin pattern used elsewhere in the app — subscribers.role === 'admin'.
export default async function InsightsPage() {
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in?redirect_url=/dashboard/insights')
  }

  const supabase = getSupabaseAdmin()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (subscriber?.role !== 'admin') {
    redirect('/dashboard/portfolio')
  }

  return <InsightsClient />
}
