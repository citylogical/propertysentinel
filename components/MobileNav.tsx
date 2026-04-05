'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'

type Props = {
  apiKey: string | undefined
}

/** Fixed 48px bar + drawer for viewports ≤768px (homepage and any non–address-page shell). */
export default function MobileNav({ apiKey }: Props) {
  const { isSignedIn, isLoaded } = useUser()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) setOpen(false)
  }, [isLoaded, isSignedIn])

  return (
    <>
      <style>{`
        .sidebar-badge {
          font-family: var(--mono, 'DM Mono', monospace);
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.08em;
          padding: 1px 5px;
          border-radius: 3px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .sidebar-badge-beta {
          background: rgba(45, 122, 58, 0.15);
          color: #4ade80;
        }
        .sidebar-badge-admin {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
      <header className="mobile-nav-bar" role="banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          <Link href="/" className="mobile-nav-brand">
            <span className="brand-wordmark-line">Property</span>
            <span className="brand-wordmark-line">Sentinel</span>
          </Link>
          <Link
            href="/leads"
            className="mobile-nav-leads-link"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.88)',
              textDecoration: 'none',
            }}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{ flexShrink: 0 }}
            >
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
              <path d="M9 18h6" />
              <path d="M10 22h4" />
            </svg>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap' }}>Leads</span>
            <span className="sidebar-badge sidebar-badge-beta">BETA</span>
          </Link>
        </div>
        <button
          type="button"
          className="mobile-nav-hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label="Open menu"
          aria-expanded={open}
        >
          <span />
          <span />
          <span />
        </button>
      </header>
      <MobileNavDrawer open={open} onClose={() => setOpen(false)} apiKey={apiKey} />
    </>
  )
}
