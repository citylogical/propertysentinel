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

let homeSearchAutocompleteInited = false
function initAutocomplete(): void {
  const input = document.getElementById(INPUT_ID) as HTMLInputElement | null
  const form = document.getElementById(FORM_ID) as HTMLFormElement | null
  const zipInput = document.getElementById('home-search-zip') as HTMLInputElement | null
  if (!input || !form || !window.google?.maps?.places?.Autocomplete) return
  if (homeSearchAutocompleteInited) return
  homeSearchAutocompleteInited = true

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

type HomeSearchProps = {
  apiKey: string | undefined
  /** When true, hide the submit button (e.g. for drawer); Enter key and autocomplete still trigger search */
  hideSubmitButton?: boolean
  /** When true, do not load the Maps script (e.g. when parent already loaded it); avoids duplicate script on property page */
  skipMapsScript?: boolean
}

export default function HomeSearch({ apiKey, hideSubmitButton, skipMapsScript }: HomeSearchProps) {
  const registeredRef = useRef(false)
  const initedRef = useRef(false)

  useEffect(() => {
    if (!apiKey || registeredRef.current) return
    registeredRef.current = true
    window.initAutocomplete = initAutocomplete
    return () => {
      delete window.initAutocomplete
    }
  }, [apiKey])

  useEffect(() => {
    if (!apiKey) return
    /* When used in drawer (hideSubmitButton), allow re-init so autocomplete attaches after drawer opens */
    if (hideSubmitButton) {
      homeSearchAutocompleteInited = false
    }
    const run = () => {
      if (initedRef.current) return
      const input = document.getElementById(INPUT_ID)
      if (!input || !window.google?.maps?.places?.Autocomplete) return
      initedRef.current = true
      initAutocomplete()
    }
    run()
    const t = setTimeout(run, 500)
    return () => {
      clearTimeout(t)
      homeSearchAutocompleteInited = false
    }
  }, [apiKey, hideSubmitButton])

  return (
    <>
      {apiKey && !skipMapsScript && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAutocomplete`}
          strategy="afterInteractive"
        />
      )}
      <div className="search-wrap">
        <form id={FORM_ID} action="/search" method="GET" className={hideSubmitButton ? 'search-bar search-bar-no-btn' : 'search-bar'}>
          <input type="hidden" id="home-search-zip" name="zip" value="" />
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
            required={!hideSubmitButton}
            placeholder="Enter a Chicago address…"
            autoComplete="off"
          />
          {!hideSubmitButton && (
            <button type="submit" className="search-btn">
              Search
            </button>
          )}
        </form>
      </div>
    </>
  )
}
