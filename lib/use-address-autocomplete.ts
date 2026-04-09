'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CHICAGO_METRO_BOUNDS } from '@/lib/google-places-address'
import type { PlacesAddressLike } from '@/lib/google-places-address'

export type AddressSuggestion = {
  description: string
  place_id: string
}

let mapsLoadPromise: Promise<void> | null = null

const MAPS_SCRIPT_SELECTOR = 'script[src*="maps.googleapis.com/maps/api/js"]'

function waitForPlacesReady(existingScript: HTMLScriptElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (globalThis.google?.maps?.places) {
      resolve()
      return
    }

    let settled = false
    let attempts = 0
    let poll: ReturnType<typeof setInterval>

    const finishErr = (msg: string) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      reject(new Error(msg))
    }

    const finishOk = () => {
      if (settled) return
      settled = true
      clearInterval(poll)
      resolve()
    }

    poll = setInterval(() => {
      if (globalThis.google?.maps?.places) {
        finishOk()
        return
      }
      attempts++
      if (attempts > 100) finishErr('Google Maps load timed out')
    }, 50)

    existingScript.addEventListener(
      'load',
      () => {
        globalThis.setTimeout(() => {
          if (globalThis.google?.maps?.places) finishOk()
          else finishErr('Google Maps loaded but places library unavailable')
        }, 50)
      },
      { once: true }
    )
    existingScript.addEventListener('error', () => finishErr('Existing Google Maps script failed'), { once: true })
  })
}

/**
 * Single coordinated loader for the Maps JavaScript API + places library.
 * Reuses any in-page script (homepage /search / PropertyNav use Next Script with
 * callback=…) — never injects a second tag, which would double-register web
 * components and flood the console with "Element with name X already defined".
 */
function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (globalThis.google?.maps?.places) return Promise.resolve()
  if (mapsLoadPromise) return mapsLoadPromise

  mapsLoadPromise = (async () => {
    const existing = document.querySelector<HTMLScriptElement>(MAPS_SCRIPT_SELECTOR)
    if (existing) {
      await waitForPlacesReady(existing)
      return
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`
      script.async = true
      script.defer = true
      script.dataset.googleMapsLoader = 'true'
      script.onload = () => {
        script.dataset.gmapsComplete = 'true'
        globalThis.setTimeout(() => {
          if (globalThis.google?.maps?.places) resolve()
          else reject(new Error('Google Maps loaded but places library unavailable'))
        }, 50)
      }
      script.onerror = () => reject(new Error('Failed to load Google Maps'))
      document.head.appendChild(script)
    })
  })()

  void mapsLoadPromise.catch(() => {
    mapsLoadPromise = null
  })

  return mapsLoadPromise
}

function chicagoBounds(): google.maps.LatLngBounds | undefined {
  if (typeof globalThis.google?.maps?.LatLngBounds === 'undefined') return undefined
  return new google.maps.LatLngBounds(
    { lat: CHICAGO_METRO_BOUNDS.south, lng: CHICAGO_METRO_BOUNDS.west },
    { lat: CHICAGO_METRO_BOUNDS.north, lng: CHICAGO_METRO_BOUNDS.east }
  )
}

/**
 * Fetch full place details for navigation (street + zip), same resolution as homepage Autocomplete.
 */
export function fetchPlaceDetailsForNavigation(
  placeId: string
): Promise<PlacesAddressLike | null> {
  return new Promise((resolve) => {
    if (typeof globalThis.google?.maps?.places === 'undefined') {
      resolve(null)
      return
    }
    const el = document.createElement('div')
    const service = new google.maps.places.PlacesService(el)
    service.getDetails(
      { placeId, fields: ['address_components', 'formatted_address'] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          resolve(place as PlacesAddressLike)
        } else {
          resolve(null)
        }
      }
    )
  })
}

/**
 * Debounced Google Places predictions for sidebar (and other) address inputs.
 * Biased with Chicago metro bounds + US restriction, same spirit as HomeSearch.
 */
export function useAddressAutocomplete(input: string) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    if (!apiKey) return
    void loadGoogleMapsScript(apiKey).then(() => {
      if (globalThis.google?.maps?.places?.AutocompleteService) {
        serviceRef.current = new google.maps.places.AutocompleteService()
      }
    })
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!input || input.trim().length < 3) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      if (!serviceRef.current) {
        setLoading(false)
        return
      }
      const bounds = chicagoBounds()
      serviceRef.current.getPlacePredictions(
        {
          input: input.trim(),
          componentRestrictions: { country: 'us' },
          types: ['address'],
          ...(bounds ? { bounds } : {}),
        },
        (predictions, status) => {
          setLoading(false)
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions?.length) {
            const sorted = [...predictions].sort((a, b) => {
              const aIsIL = /\bIL\b/.test(a.description) ? -1 : 0
              const bIsIL = /\bIL\b/.test(b.description) ? -1 : 0
              return aIsIL - bIsIL
            })
            setSuggestions(
              sorted.slice(0, 6).map((p) => ({
                description: p.description,
                place_id: p.place_id,
              }))
            )
          } else {
            setSuggestions([])
          }
        }
      )
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input])

  const clearSuggestions = useCallback(() => {
    setSuggestions([])
  }, [])

  return { suggestions, loading, clearSuggestions }
}
