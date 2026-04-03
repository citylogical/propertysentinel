import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ProfileContent from './ProfileContent'

export const metadata = {
  title: 'Property Sentinel — Account',
}

export default async function ProfilePage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <div className="address-page">
      <div className="prop-page-shell">
        <div className="prop-main-content">
          <div className="address-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="address-header-street">Account</div>
            </div>
          </div>
          <ProfileContent />
        </div>
      </div>
    </div>
  )
}
