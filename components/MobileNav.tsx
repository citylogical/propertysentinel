'use client'

import { useState } from 'react'
import Link from 'next/link'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'

type Props = {
  apiKey: string | undefined
}

/** Fixed 48px bar + drawer for viewports ≤768px (homepage and any non–address-page shell). */
export default function MobileNav({ apiKey }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="mobile-nav-bar" role="banner">
        <Link href="/" className="mobile-nav-brand">
          Property Sentinel
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
