import { currentUser } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import PropertySidebar from '@/components/PropertySidebar'
import BlogEditor from './BlogEditor'
import '../../about/about.css'

export const metadata = {
  title: 'Property Sentinel — Blog Editor',
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function AdminBlogPage() {
  const user = await currentUser()
  if (!user) redirect('/')

  const supabase = getSupabase()
  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('role')
    .eq('clerk_id', user.id)
    .single()

  if (!subscriber || subscriber.role !== 'admin') {
    redirect('/')
  }

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <PropertySidebar initialTab="explore" />
        <div className="prop-main-content">
          <div className="address-header" style={{ justifyContent: 'center', textAlign: 'center' }}>
            <div>
              <div className="address-header-street">Blog Editor</div>
              <div className="address-header-meta">Draft · Edit · Publish</div>
            </div>
          </div>
          <BlogEditor />
        </div>
      </div>
    </div>
  )
}
