'use client'

import { SignInButton, useAuth } from '@clerk/nextjs'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useEffect, useRef } from 'react'
import { addressToSlug } from '@/lib/address-slug'

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
  const registeredRef = useRef(false)

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

        {addressRange && (
          <button
            type="button"
            className={`address-header-icon-btn ${!isExpanded ? 'address-header-icon-btn-building' : ''}`}
            title={isExpanded ? 'View Prior Address' : 'View Full Building'}
            onClick={() =>
              isExpanded ? router.push(`/address/${slug}`) : router.push(`/address/${slug}?building=true`)
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isExpanded ? '#0f2744' : '#92400e'} strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
        )}

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
      </div>
    </>
  )
}
