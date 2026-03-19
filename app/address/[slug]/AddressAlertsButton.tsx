'use client'

import { SignInButton, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export default function AddressAlertsButton() {
  const { isSignedIn } = useAuth()
  const router = useRouter()

  const icon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button type="button" className="alert-btn">
          {icon}
          Turn on Alerts
        </button>
      </SignInButton>
    )
  }

  return (
    <button type="button" className="alert-btn" onClick={() => router.push('/profile')}>
      {icon}
      Turn on Alerts
    </button>
  )
}
