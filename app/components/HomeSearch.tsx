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
      <div className="max-w-2xl mx-auto">
        <form
          id={FORM_ID}
          action="/search"
          method="GET"
          className="flex gap-3 bg-white rounded-xl shadow-lg p-3"
        >
          <input
            id={INPUT_ID}
            type="text"
            name="address"
            required
            placeholder="Enter a Chicago property address..."
            className="flex-1 px-4 py-3 text-base outline-none rounded-lg"
            style={{ fontFamily: 'sans-serif' }}
            autoComplete="off"
          />
          <button
            type="submit"
            className="px-8 py-3 rounded-lg text-white font-semibold text-base transition-colors"
            style={{ backgroundColor: '#003366', fontFamily: 'sans-serif' }}
          >
            Search
          </button>
        </form>
        <p className="text-sm text-slate-400 mt-3">
          Free to search any Chicago address. No account required.
        </p>
      </div>
    </>
  )
}
