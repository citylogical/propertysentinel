'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Session } from '@supabase/supabase-js'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'
import NavMenuDropdown from '@/app/components/NavMenuDropdown'
import HamburgerIcon from '@/app/components/HamburgerIcon'
import LoginModal from '@/app/components/LoginModal'

type LandingNavProps = {
  apiKey: string | undefined
}

export default function LandingNav({ apiKey }: LandingNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  return (
    <>
      <nav className="landing-nav">
        <Link className="nav-brand" href="/">
          Property Sentinel
        </Link>
        <div
          ref={menuRef}
          className="relative flex items-center"
          onMouseEnter={() => {
            if (typeof window !== 'undefined' && window.innerWidth >= 769) setMenuOpen(true)
          }}
          onMouseLeave={() => {
            if (typeof window !== 'undefined' && window.innerWidth >= 769) setMenuOpen(false)
          }}
        >
          <button
            type="button"
            className="flex items-center justify-center w-10 h-10 text-white border-0 bg-transparent cursor-pointer p-0 hover:opacity-100 opacity-90 transition-opacity nav-hamburger-btn"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <HamburgerIcon />
          </button>
          {menuOpen && (
            <NavMenuDropdown
              onClose={() => setMenuOpen(false)}
              onLoginClick={() => setLoginModalOpen(true)}
              apiKey={apiKey}
              session={session}
            />
          )}
        </div>
      </nav>
      <MobileNavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onLoginClick={() => setLoginModalOpen(true)}
        apiKey={apiKey}
        session={session}
      />
      <LoginModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} isAuthenticated={!!session} />
    </>
  )
}
