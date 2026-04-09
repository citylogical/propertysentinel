'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'
import { CHICAGO_METRO_BOUNDS, resolveStreetAndZipForNavigation } from '@/lib/google-places-address'

type PlaceResult = {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  formatted_address?: string
}

declare global {
  interface Window {
    initSearchPageAutocomplete?: () => void
  }
}

const INPUT_ID = 'search-page-address'
const FORM_ID = 'search-page-form'

let searchPageAutocompleteInited = false

function initSearchPageAutocomplete(): void {
  const input = document.getElementById(INPUT_ID) as HTMLInputElement | null
  const form = document.getElementById(FORM_ID) as HTMLFormElement | null
  const zipInput = document.getElementById('search-page-zip') as HTMLInputElement | null
  if (!input || !form || !window.google?.maps?.places?.Autocomplete) return
  if (searchPageAutocompleteInited) return
  searchPageAutocompleteInited = true

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
    input.value = resolved.street
    if (zipInput) zipInput.value = resolved.zip ?? ''
    form.submit()
  })
}

type Props = {
  apiKey: string | undefined
}

export default function SearchHero({ apiKey }: Props) {
  const registeredRef = useRef(false)
  const initedRef = useRef(false)

  useEffect(() => {
    if (!apiKey || registeredRef.current) return
    registeredRef.current = true
    window.initSearchPageAutocomplete = initSearchPageAutocomplete
    return () => {
      delete window.initSearchPageAutocomplete
    }
  }, [apiKey])

  useEffect(() => {
    if (!apiKey) return
    const run = () => {
      if (initedRef.current) return
      const input = document.getElementById(INPUT_ID)
      if (!input || !window.google?.maps?.places?.Autocomplete) return
      initedRef.current = true
      initSearchPageAutocomplete()
    }
    run()
    const t = setTimeout(run, 500)
    return () => {
      clearTimeout(t)
      searchPageAutocompleteInited = false
      initedRef.current = false
    }
  }, [apiKey])

  return (
    <div className="search-hero">
      {apiKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=initSearchPageAutocomplete`}
          strategy="afterInteractive"
        />
      )}
      <div className="search-hero-grid" aria-hidden />
      <div className="search-hero-inner">
        <div className="search-hero-bar-wrap">
          <form id={FORM_ID} action="/search" method="GET" className="search-bar">
            <input type="hidden" id="search-page-zip" name="zip" value="" />
            <div className="search-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <input
              id={INPUT_ID}
              type="text"
              name="address"
              required
              placeholder="Enter a Chicago address..."
              autoComplete="off"
            />
            <button type="submit" className="search-btn">
              Search
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
