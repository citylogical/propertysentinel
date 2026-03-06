'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'

type PlaceResult = {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  formatted_address?: string
}

declare global {
  interface Window {
    initAutocomplete?: () => void
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: {
              types?: string[]
              componentRestrictions?: { country: string }
              bounds?: { north: number; south: number; east: number; west: number }
              strictBounds?: boolean
            }
          ) => {
            getPlace: () => PlaceResult
            addListener: (event: string, fn: () => void) => void
          }
        }
      }
    }
  }
}

const INPUT_ID = 'home-search-address'
const FORM_ID = 'home-search-form'

const CHICAGO_BOUNDS = {
  north: 41.9742,
  south: 41.6445,
  east: -87.524,
  west: -87.9401,
}

function getStreetAddressOnly(place: PlaceResult): string {
  const components = place.address_components ?? []
  const map: Record<string, string> = {}
  components.forEach((c) => {
    c.types.forEach((t) => {
      map[t] = c.long_name
    })
  })
  const streetNumber = map.street_number ?? ''
  const route = map.route ?? ''
  const street = [streetNumber, route].filter(Boolean).join(' ')
  return street || (place.formatted_address ?? '')
}

function initAutocomplete(): void {
  const input = document.getElementById(INPUT_ID) as HTMLInputElement | null
  const form = document.getElementById(FORM_ID) as HTMLFormElement | null
  if (!input || !form || !window.google?.maps?.places?.Autocomplete) return

  const autocomplete = new window.google.maps.places.Autocomplete(input, {
    types: ['address'],
    componentRestrictions: { country: 'us' },
    bounds: CHICAGO_BOUNDS,
    strictBounds: true,
  })

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace() as PlaceResult
    if (!place.address_components && !place.formatted_address) return
    const streetOnly = getStreetAddressOnly(place)
    if (streetOnly) {
      input.value = streetOnly
      form.submit()
    }
  })
}

type HomeSearchProps = {
  apiKey: string | undefined
}

export default function HomeSearch({ apiKey }: HomeSearchProps) {
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!apiKey || registeredRef.current) return
    registeredRef.current = true
    window.initAutocomplete = initAutocomplete
    return () => {
      delete window.initAutocomplete
    }
  }, [apiKey])

  return (
    <>
      {apiKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAutocomplete`}
          strategy="afterInteractive"
        />
      )}
      <div className="search-wrap">
        <form id={FORM_ID} action="/search" method="GET" className="search-bar">
          <div className="search-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </div>
          <input
            id={INPUT_ID}
            type="text"
            name="address"
            required
            placeholder="Enter a Chicago address…"
            autoComplete="off"
          />
          <button type="submit" className="search-btn">
            Search
          </button>
        </form>
      </div>
    </>
  )
}
