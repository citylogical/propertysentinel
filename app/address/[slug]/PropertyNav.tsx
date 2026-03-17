'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useRef, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addressToSlug } from '@/lib/address-slug'
import type { Session } from '@supabase/supabase-js'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'
import NavMenuDropdown from '@/app/components/NavMenuDropdown'
import HamburgerIcon from '@/app/components/HamburgerIcon'

const NAV_SEARCH_INPUT_ID = 'prop-nav-search-input'

type PlaceResult = {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  formatted_address?: string
}

const CHICAGO_BOUNDS = {
  north: 41.9742,
  south: 41.6445,
  east: -87.524,
  west: -87.9401,
}

function getStreetAndZip(place: PlaceResult): { street: string; zip: string | null } {
  const components = place.address_components ?? []
  const map: Record<string, string> = {}
  components.forEach((c) => {
    c.types.forEach((t) => {
      map[t] = c.long_name
    })
  })
  const streetNumber = map.street_number ?? ''
  const route = map.route ?? ''
  const street = [streetNumber, route].filter(Boolean).join(' ') || (place.formatted_address ?? '')
  const zip = map.postal_code && /^\d{5}$/.test(map.postal_code) ? map.postal_code : null
  return { street, zip }
}

declare global {
  interface Window {
    initNavAutocomplete?: () => void
  }
}

function initNavAutocomplete(): void {
  const input = document.getElementById(NAV_SEARCH_INPUT_ID) as HTMLInputElement | null
  if (!input || !window.google?.maps?.places?.Autocomplete) return

  const autocomplete = new window.google.maps.places.Autocomplete(input, {
    types: ['address'],
    componentRestrictions: { country: 'us' },
    bounds: CHICAGO_BOUNDS,
    strictBounds: true,
  })

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace() as PlaceResult
    if (!place.address_components && !place.formatted_address) return
    const { street, zip } = getStreetAndZip(place)
    if (street) {
      const zipInput = document.getElementById('prop-nav-zip') as HTMLInputElement | null
      if (zipInput) zipInput.value = zip ?? ''
      const slug = addressToSlug(street, zip)
      window.location.href = `/address/${slug}`
    }
  })
}

type PropertyNavProps = { apiKey?: string }

export default function PropertyNav({ apiKey }: PropertyNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const registeredRef = useRef(false)

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

  useEffect(() => {
    if (!apiKey || registeredRef.current) return
    registeredRef.current = true
    window.initNavAutocomplete = initNavAutocomplete
    return () => {
      delete window.initNavAutocomplete
    }
  }, [apiKey])

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const address = (form.querySelector('input[name="address"]') as HTMLInputElement)?.value?.trim()
    const zip = (form.querySelector('input[name="zip"]') as HTMLInputElement)?.value?.trim()
    if (!address) return
    const slug = addressToSlug(address, zip || undefined)
    window.location.href = `/address/${slug}`
  }

  return (
    <>
      <nav className="prop-nav">
        {apiKey && (
          <Script
            src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initNavAutocomplete`}
            strategy="afterInteractive"
          />
        )}
        <Link className="nav-brand" href="/">
          Property Sentinel
        </Link>

        {/* Mobile: hamburger only */}
        <button
          type="button"
          className="nav-hamburger md:hidden flex items-center justify-center w-10 h-10 text-white border-0 bg-transparent cursor-pointer p-0"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <HamburgerIcon />
        </button>

        {/* Desktop: search + hamburger (dropdown replaces About + Profile) */}
        <div className="nav-right hidden md:flex">
          <div className="nav-search-wrap">
            <svg
              className="nav-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <form action="/search" method="GET" onSubmit={handleSearchSubmit}>
              <input type="hidden" name="zip" value="" id="prop-nav-zip" />
              <input
                id={NAV_SEARCH_INPUT_ID}
                className="nav-search-input"
                type="text"
                name="address"
                placeholder="New Chicago search…"
                autoComplete="off"
              />
            </form>
          </div>
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
              className="nav-hamburger flex items-center justify-center w-10 h-10 text-white border-0 bg-transparent cursor-pointer p-0"
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
                session={session}
                skipMapsScript
              />
            )}
          </div>
        </div>
      </nav>

      <MobileNavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        apiKey={apiKey}
        session={session}
        skipMapsScript
      />
    </>
  )
}
