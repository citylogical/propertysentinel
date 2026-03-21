'use client'

import { SignInButton, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import type React from 'react'

type Props = {
  addressRange: string | null
  slug: string
  isExpanded: boolean
}

const leftArrowIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

const warningIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const bookmarkIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)

const bellIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const BTN_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 14px',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  color: 'white',
  fontFamily: 'var(--sans)',
  flexShrink: 0,
}

const BTN_AMBER: React.CSSProperties = {
  ...BTN_BASE,
  background: '#d97706',
  border: '1.5px solid #92400e',
}

const BTN_GREY: React.CSSProperties = {
  ...BTN_BASE,
  background: '#6b7280',
  border: '1.5px solid #4b5563',
  color: 'white',
}

const BTN_GREEN: React.CSSProperties = {
  ...BTN_BASE,
  background: '#3b6d11',
  border: '1.5px solid #173404',
}

const BTN_RED: React.CSSProperties = {
  ...BTN_BASE,
  background: '#e03131',
  border: '1.5px solid rgba(255,255,255,0.2)',
}

export default function AddressBarButtons({ addressRange, slug, isExpanded }: Props) {
  const { isSignedIn } = useAuth()
  const router = useRouter()

  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      {addressRange && (
        isExpanded ? (
          <button type="button" style={BTN_GREY} onClick={() => router.push(`/address/${slug}`)}>
            {leftArrowIcon}
            View Prior Address
          </button>
        ) : (
          <button type="button" style={BTN_AMBER} onClick={() => router.push(`/address/${slug}?building=true`)}>
            {warningIcon}
            View Full Building
          </button>
        )
      )}

      <button type="button" style={BTN_GREEN}>
        {bookmarkIcon}
        Save
      </button>

      {!isSignedIn ? (
        <SignInButton mode="modal">
          <button type="button" style={BTN_RED}>
            {bellIcon}
            Alerts
          </button>
        </SignInButton>
      ) : (
        <button type="button" style={BTN_RED} onClick={() => router.push('/profile')}>
          {bellIcon}
          Alerts
        </button>
      )}
    </div>
  )
}