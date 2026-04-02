'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import NavMenuDropdown from '@/app/components/NavMenuDropdown'
import HamburgerIcon from '@/app/components/HamburgerIcon'

type LandingNavProps = {
  apiKey: string | undefined
}

export default function LandingNav({ apiKey }: LandingNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
      <nav className="landing-nav home-nav homepage-nav">
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
              apiKey={apiKey}
            />
          )}
        </div>
      </nav>
    </>
  )
}
