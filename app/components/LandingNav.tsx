'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'

type LandingNavProps = {
  apiKey: string | undefined
}

export default function LandingNav({ apiKey }: LandingNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      <nav className="landing-nav">
        <Link className="nav-brand" href="/">
          Property Sentinel
        </Link>
        <button
          type="button"
          className="nav-menu-btn"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        {/* Desktop: hide hamburger so we don't show it on large screens if we add desktop nav items later */}
      </nav>
      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        apiKey={apiKey}
        session={session}
      />
    </>
  )
}
