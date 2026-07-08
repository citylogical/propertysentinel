'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { SignInButton } from '@clerk/nextjs'

type Props = {
  kind: 'signed_out' | 'no_properties'
  context: 'portfolio' | 'activity'
}

const UNLOCK_BULLETS: ReactNode[] = [
  <>Add any Chicago property to unlock its full report — <strong>311 complaint detail, violations, and permits</strong></>,
  <><strong>Daily alerts</strong> the moment a new complaint, violation, or permit is filed at your buildings</>,
  <><strong>30-day free trial</strong> — then one flat monthly price based on your portfolio size</>,
]

export default function DashboardEmptyState({ kind }: Props) {
  const isSignedOut = kind === 'signed_out'
  const [stagedCount, setStagedCount] = useState(0)

  // Properties in the queue but none saved yet: surface the queue trigger
  // next to the add button and soften the add copy.
  useEffect(() => {
    if (isSignedOut) return
    let cancelled = false
    fetch('/api/dashboard/stage')
      .then((r) => r.json())
      .then((data: { staged_count?: number }) => {
        if (!cancelled) setStagedCount(data.staged_count ?? 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isSignedOut])

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
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
            {stagedCount > 0 ? (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('ps:open-staged-queue'))}
                style={{
                  padding: '11px 22px',
                  background: '#1e40af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Review added properties
              </button>
            ) : null}
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
              {stagedCount > 0 ? 'Add more properties' : 'Add your first property'}
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
