import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import ProfileDashboard, { type MonitoredPropertyRow, type SubscriberRow } from './ProfileDashboard'

export default async function ProfilePage() {
  const { userId } = await auth()
  if (!userId) redirect('/')

  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''

  const supabase = getSupabaseAdmin()

  const { data: subRow } = await supabase
    .from('subscribers')
    .select('first_name, last_name, phone, zip, plan, created_at')
    .eq('clerk_id', userId)
    .maybeSingle()

  const { data: propRows } = await supabase
    .from('monitored_properties')
    .select('id, address, zip, status')
    .eq('clerk_id', userId)
    .order('created_at', { ascending: false })

  const initialSubscriber: SubscriberRow | null = subRow
    ? {
        first_name: subRow.first_name ?? null,
        last_name: subRow.last_name ?? null,
        phone: subRow.phone ?? null,
        zip: subRow.zip ?? null,
        plan: subRow.plan ?? 'free',
        created_at: subRow.created_at ?? null,
      }
    : null

  const initialProperties: MonitoredPropertyRow[] = (propRows ?? []).map((r: { id: string; address: string; zip: string | null; status: string | null }) => ({
    id: String(r.id),
    address: r.address ?? '',
    zip: r.zip ?? null,
    status: r.status ?? 'active',
  }))

  return <ProfileDashboard email={email} initialSubscriber={initialSubscriber} initialProperties={initialProperties} />
}
