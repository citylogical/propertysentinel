'use client'

import { SignInButton, useAuth } from '@clerk/nextjs'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { addressToSlug } from '@/lib/address-slug'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'
import NavMenuDropdown from '@/app/components/NavMenuDropdown'

const ADDRESS_HEADER_SEARCH_INPUT_ID = 'address-header-search-input'

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
    initAddressHeaderAutocomplete?: () => void
  }
}

function initAddressHeaderAutocomplete(): void {
  const input = document.getElementById(ADDRESS_HEADER_SEARCH_INPUT_ID) as HTMLInputElement | null
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
      const zipInput = document.getElementById('address-header-zip') as HTMLInputElement | null
      if (zipInput) zipInput.value = zip ?? ''
      const slug = addressToSlug(street, zip)
      window.location.href = `/address/${encodeURIComponent(slug)}`
    }
  })
}

type Props = {
  addressRange: string | null
  slug: string
  isExpanded: boolean
  apiKey?: string
}

export default function AddressBarButtons({ addressRange, slug, isExpanded, apiKey }: Props) {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
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
    window.initAddressHeaderAutocomplete = initAddressHeaderAutocomplete
    return () => {
      delete window.initAddressHeaderAutocomplete
    }
  }, [apiKey])

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const address = (form.querySelector('input[name="address"]') as HTMLInputElement)?.value?.trim()
    const zip = (form.querySelector('input[name="zip"]') as HTMLInputElement)?.value?.trim()
    if (!address) return
    const nextSlug = addressToSlug(address, zip || undefined)
    window.location.href = `/address/${encodeURIComponent(nextSlug)}`
  }

  const buildingBtnStyle = (bg: string, border: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: 'white',
    fontFamily: 'var(--sans)',
    flexShrink: 0,
    background: bg,
    border: `1px solid ${border}`,
  })

  const leftArrowIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )

  const warningIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )

  return (
    <>
      {apiKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAddressHeaderAutocomplete`}
          strategy="afterInteractive"
        />
      )}
      <div className="address-bar-buttons">
        <div className="address-header-search-wrap">
          <svg className="address-header-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <form action="/search" method="GET" onSubmit={handleSearchSubmit}>
            <input type="hidden" name="zip" value="" id="address-header-zip" />
            <input
              id={ADDRESS_HEADER_SEARCH_INPUT_ID}
              className="address-header-search-input"
              type="text"
              name="address"
              placeholder="New Chicago search..."
              autoComplete="off"
            />
          </form>
        </div>

        {addressRange &&
          (isExpanded ? (
            <button
              type="button"
              style={buildingBtnStyle('#6b7280', '#4b5563')}
              onClick={() => router.push(`/address/${slug}`)}
            >
              {leftArrowIcon}
              View Prior Address
            </button>
          ) : (
            <button
              type="button"
              style={buildingBtnStyle('#d97706', '#92400e')}
              onClick={() => router.push(`/address/${slug}?building=true`)}
            >
              {warningIcon}
              View Full Building
            </button>
          ))}

        <button type="button" className="address-header-icon-btn address-header-icon-btn-save" title="Save">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {!isSignedIn ? (
          <SignInButton mode="modal">
            <button type="button" className="address-header-icon-btn address-header-icon-btn-alert" title="Alerts">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </SignInButton>
        ) : (
          <button
            type="button"
            className="address-header-icon-btn address-header-icon-btn-alert"
            title="Alerts"
            onClick={() => router.push('/profile')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        )}

        <div
          ref={menuRef}
          className="relative flex items-center"
          onMouseEnter={() => {
            if (typeof window !== 'undefined' && window.innerWidth >= 901) setMenuOpen(true)
          }}
          onMouseLeave={() => {
            if (typeof window !== 'undefined' && window.innerWidth >= 901) setMenuOpen(false)
          }}
        >
          <button
            type="button"
            className="address-header-hamburger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
          {menuOpen && (
            <NavMenuDropdown onClose={() => setMenuOpen(false)} apiKey={apiKey} skipMapsScript />
          )}
        </div>
      </div>

      <MobileNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} apiKey={apiKey} skipMapsScript />
    </>
  )
}
