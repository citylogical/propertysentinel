import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const { userId } = await auth()
  if (!userId) redirect('/')

  return <ProfileClient />
}
