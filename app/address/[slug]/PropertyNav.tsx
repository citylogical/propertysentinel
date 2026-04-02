'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useRef, useState, useEffect } from 'react'
import { addressToSlug } from '@/lib/address-slug'
import { CHICAGO_METRO_BOUNDS, resolveStreetAndZipForNavigation } from '@/lib/google-places-address'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'
import NavMenuDropdown from '@/app/components/NavMenuDropdown'
import HamburgerIcon from '@/app/components/HamburgerIcon'

const NAV_SEARCH_INPUT_ID = 'prop-nav-search-input'

type PlaceResult = {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  formatted_address?: string
}

declare global {
  interface Window {
    initNavAutocomplete?: () => void
  }
}

function initNavAutocomplete(): void {
  const input = document.getElementById(NAV_SEARCH_INPUT_ID) as HTMLInputElement | null
  if (!input || !window.google?.maps?.places?.Autocomplete) return

  let lastTyped = input.value
  input.addEventListener('input', () => {
    lastTyped = input.value
  })

  const autocomplete = new window.google.maps.places.Autocomplete(input, {
    types: ['address'],
    componentRestrictions: { country: 'us' },
    bounds: CHICAGO_METRO_BOUNDS,
    strictBounds: false,
  })

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace() as PlaceResult
    if (!place.address_components && !place.formatted_address) return
    const resolved = resolveStreetAndZipForNavigation(lastTyped, place)
    if (!resolved?.street) return
    const { street, zip } = resolved
    const zipInput = document.getElementById('prop-nav-zip') as HTMLInputElement | null
    if (zipInput) zipInput.value = zip ?? ''
    const slug = addressToSlug(street, zip)
    window.location.href = `/address/${slug}`
  })
}

type PropertyNavProps = { apiKey?: string }

export default function PropertyNav({ apiKey }: PropertyNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const registeredRef = useRef(false)

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
                style={{
                  width: searchFocused ? 360 : 320,
                  transition: 'background 0.15s, border-color 0.15s, width 0.2s',
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
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
        skipMapsScript
      />
    </>
  )
}
