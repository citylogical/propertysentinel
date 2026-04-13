'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'
import BuildingLogoIcon from '@/components/BuildingLogoIcon'

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
        <Link href="/" className="mobile-nav-brand">
          <span className="mobile-nav-brand-icon">
            <BuildingLogoIcon />
          </span>
          <span className="mobile-nav-brand-text">
            <span className="brand-wordmark-line">Property</span>
            <span className="brand-wordmark-line">Sentinel</span>
          </span>
        </Link>
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
