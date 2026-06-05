'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * SlideInPanel — wraps the 311-complaints page body. On mount it animates in
 * from the right (entrance-only; the settings page it was navigated from
 * unmounts normally). Also renders the back-to-settings arrow link.
 *
 * Entrance-only by design: a true coordinated two-panel transition would
 * require keeping both routes mounted under a shared layout. The rightward
 * slide-in reads as a slide-over without that complexity.
 */
export default function SlideInPanel({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    // Next frame so the initial (off-screen) state paints before transitioning.
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      style={{
        transform: entered ? 'translateX(0)' : 'translateX(40px)',
        opacity: entered ? 1 : 0,
        transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease',
        willChange: 'transform, opacity',
      }}
    >
      <Link
        href="/dashboard/settings"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          textDecoration: 'none',
          color: '#6b7280',
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 16,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M10 12L6 8l4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Back to settings</span>
      </Link>
      {children}
    </div>
  )
}