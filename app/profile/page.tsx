import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ProfileContent from './ProfileContent'

export const metadata: Metadata = {
  title: 'Property Sentinel — Account',
  alternates: {
    canonical: '/profile',
  },
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
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 0' }}>
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
              Account
            </h1>
            <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
              Manage your information and access
            </div>
          </div>
          <ProfileContent />
        </div>
      </div>
    </div>
  )
}
