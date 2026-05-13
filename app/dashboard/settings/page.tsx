import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import SettingsContent from './SettingsContent'

export const metadata: Metadata = {
  title: 'Property Sentinel — Settings',
}

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px 40px' }}>
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
        Alert settings
      </h1>
      <div style={{ fontSize: 12, color: '#888', marginTop: 6, marginBottom: 24 }}>
        Configure who gets notified and what triggers alerts
      </div>
      <SettingsContent />
    </div>
  )
}
