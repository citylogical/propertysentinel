'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useRef, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addressToSlug } from '@/lib/address-slug'
import type { Session } from '@supabase/supabase-js'
import HomeSearch from '@/app/components/HomeSearch'

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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const registeredRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

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
          onClick={() => setDrawerOpen(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Desktop: search + about + login */}
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
            className={`nav-dropdown ${dropdownOpen ? 'open' : ''}`}
            ref={dropdownRef}
          >
            <button
              type="button"
              className="nav-dropdown-btn"
              onClick={() => setDropdownOpen((o) => !o)}
            >
              About
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div className="nav-dropdown-panel">
              <Link className="nav-dropdown-row" href="/" onClick={() => setDropdownOpen(false)}>
                <div className="nav-dropdown-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div>
                  <div className="nav-dropdown-label">Property Sentinel</div>
                  <div className="nav-dropdown-desc">Real-time monitoring for Chicago landlords and STR operators</div>
                </div>
              </Link>
              <Link className="nav-dropdown-row" href="/#how" onClick={() => setDropdownOpen(false)}>
                <div className="nav-dropdown-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <div className="nav-dropdown-label">How it works</div>
                  <div className="nav-dropdown-desc">Where the data comes from and what we monitor</div>
                </div>
              </Link>
              <Link className="nav-dropdown-row" href="/#contact" onClick={() => setDropdownOpen(false)}>
                <div className="nav-dropdown-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="nav-dropdown-label">Contact</div>
                  <div className="nav-dropdown-desc">Questions, partnerships, or press inquiries</div>
                </div>
              </Link>
            </div>
          </div>
          {session ? (
            <Link href="/profile" className="nav-auth-btn">
              Profile
            </Link>
          ) : (
            <Link href="/login" className="nav-auth-btn">
              Login
            </Link>
          )}
        </div>
      </nav>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[200] bg-white md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="flex flex-col h-full">
            <div className="flex justify-end p-4 shrink-0">
              <button
                type="button"
                className="flex items-center justify-center w-10 h-10 text-[#1a1a1a] border-0 bg-transparent cursor-pointer rounded hover:bg-gray-100"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <span className="text-2xl leading-none font-sans">×</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto px-4 pb-6">
              <div className="min-h-[56px] flex items-center border-b border-gray-200 mb-1">
                <div className="w-full">
                  <HomeSearch apiKey={apiKey} />
                </div>
              </div>
              <Link
                href="/tax-appeals"
                className="flex items-center min-h-[56px] px-0 py-4 text-base font-normal text-[#1a1a1a] border-b border-gray-200 no-underline hover:bg-gray-50 font-sans"
                onClick={() => setDrawerOpen(false)}
              >
                Tax Appeals
              </Link>
              <Link
                href="/about"
                className="flex items-center min-h-[56px] px-0 py-4 text-base font-normal text-[#1a1a1a] border-b border-gray-200 no-underline hover:bg-gray-50 font-sans"
                onClick={() => setDrawerOpen(false)}
              >
                About
              </Link>
              <Link
                href="/contact"
                className="flex items-center min-h-[56px] px-0 py-4 text-base font-normal text-[#1a1a1a] border-b border-gray-200 no-underline hover:bg-gray-50 font-sans"
                onClick={() => setDrawerOpen(false)}
              >
                Contact
              </Link>
              {session ? (
                <Link
                  href="/profile"
                  className="flex items-center min-h-[56px] px-0 py-4 text-base font-normal text-[#c0392b] border-b border-gray-200 no-underline hover:bg-gray-50 font-sans"
                  onClick={() => setDrawerOpen(false)}
                >
                  My Account
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center min-h-[56px] px-0 py-4 text-base font-normal text-[#c0392b] border-b border-gray-200 no-underline hover:bg-gray-50 font-sans"
                  onClick={() => setDrawerOpen(false)}
                >
                  Log In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
