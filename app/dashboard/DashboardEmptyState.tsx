'use client'

import type { CSSProperties } from 'react'
import { SignInButton } from '@clerk/nextjs'

type Props = {
  kind: 'signed_out' | 'no_properties'
  context: 'portfolio' | 'activity'
}

const UNLOCK_BULLETS = [
  'Save any Chicago property to unlock its full report — 311 complaint detail, violations, and permits',
  'Daily alerts the moment a new complaint, violation, or permit is filed at your buildings',
  'Free for 30 days from your first save — then $10 per property each month',
]

export default function DashboardEmptyState({ kind }: Props) {
  const isSignedOut = kind === 'signed_out'

  const ctaButtonStyle: CSSProperties = {
    display: 'inline-block',
    padding: '11px 24px',
    background: '#0f2744',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '64px 24px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'Merriweather, Georgia, serif',
            fontSize: 22,
            fontWeight: 600,
            color: '#0f2744',
            marginBottom: 10,
          }}
        >
          Add your first property
        </div>
        <div
          style={{
            fontSize: 14,
            color: '#6b7280',
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          Track 311 complaints, building violations, and permits across every property you own or manage in Chicago.
        </div>

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 auto 28px',
            textAlign: 'left',
            maxWidth: 460,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {UNLOCK_BULLETS.map((b, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                fontSize: 13,
                color: '#374151',
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: '#166534', fontWeight: 700, flexShrink: 0 }}>✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {isSignedOut ? (
          <SignInButton mode="modal">
            <button type="button" style={ctaButtonStyle}>
              Sign in to get started
            </button>
          </SignInButton>
        ) : (
          <button
            type="button"
            style={ctaButtonStyle}
            onClick={() => {
              // Opens the global search via AppSidebar's Cmd+K listener —
              // same mechanism as the header "+ Add property" button.
              window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
              )
            }}
          >
            Search an address
          </button>
        )}
      </div>
    </div>
  )
}
