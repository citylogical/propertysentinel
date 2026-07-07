'use client'

import type { CSSProperties, ReactNode } from 'react'
import { SignInButton } from '@clerk/nextjs'

type Props = {
  kind: 'signed_out' | 'no_properties'
  context: 'portfolio' | 'activity'
}

const UNLOCK_BULLETS: ReactNode[] = [
  <>Save any Chicago property to unlock its full report — <strong>311 complaint detail, violations, and permits</strong></>,
  <><strong>Daily alerts</strong> the moment a new complaint, violation, or permit is filed at your buildings</>,
  <><strong>Free for 30 days</strong> from your first save — then flat pricing per unit per month</>,
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
    <div style={{ minHeight: '80vh', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        {!isSignedOut ? (
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('ps:open-add-property'))}
              style={{
                padding: '11px 22px',
                background: '#166534',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add your first property
            </button>
          </div>
        ) : null}

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
              Sign-up to get started
            </button>
          </SignInButton>
        ) : null}
      </div>
    </div>
  )
}
