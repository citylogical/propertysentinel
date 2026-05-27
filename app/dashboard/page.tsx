import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Root /dashboard redirect. Admins land on the new insights dashboard by
// default; everyone else continues to the portfolio view. Either path is
// directly navigable by URL, so admins haven't lost portfolio access — they
// just no longer get bounced there from the root.
export default async function DashboardIndexPage() {
  const { userId } = await auth()

  if (userId) {
    const supabase = getSupabaseAdmin()
    const { data: subscriber } = await supabase
      .from('subscribers')
      .select('role')
      .eq('clerk_id', userId)
      .maybeSingle()

    if (subscriber?.role === 'admin') {
      redirect('/dashboard/insights')
    }
  }

  redirect('/dashboard/portfolio')
}
