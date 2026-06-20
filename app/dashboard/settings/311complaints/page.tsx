import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import SettingsComplaintsTable from './SettingsComplaintsTable'

export default async function ComplaintsSettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 24px 40px' }}>
      <h1
        style={{
          fontFamily: 'Merriweather, Georgia, serif',
          fontSize: 24,
          fontWeight: 600,
          color: '#1a1a1a',
          margin: 0,
          marginBottom: 20,
          lineHeight: 1.2,
        }}
      >
        311 complaint alerts
      </h1>
      <SettingsComplaintsTable />
    </div>
  )
}
