'use client'

/**
 * Single source of truth for loading the Google Maps JavaScript API + Places.
 * All autocomplete UX flows call loadGoogleMaps() / fetchAddressSuggestions() from here.
 */

import { CHICAGO_METRO_BOUNDS } from '@/lib/google-places-address'
import type { PlacesAddressLike } from '@/lib/google-places-address'

type AutocompleteSuggestionLike = {
  placePrediction?: {
    placeId: string
    text?: { text: string }
    mainText?: { text: string }
    secondaryText?: { text: string }
  }
}

type PlacesNamespace = typeof google.maps.places & {
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions: (request: {
      input: string
      includedPrimaryTypes?: string[]
      includedRegionCodes?: string[]
      locationBias?: google.maps.LatLngBoundsLiteral
      locationRestriction?: unknown
      sessionToken?: unknown
    }) => Promise<{ suggestions?: AutocompleteSuggestionLike[] }>
  }
}

function getPlacesNamespace(): PlacesNamespace | undefined {
  return window.google?.maps?.places as PlacesNamespace | undefined
}

function isPlacesReady(): boolean {
  const p = getPlacesNamespace()
  if (!p) return false
  if (typeof p.AutocompleteService === 'function') return true
  const modern = p.AutocompleteSuggestion
  return Boolean(modern && typeof modern.fetchAutocompleteSuggestions === 'function')
}

let loadPromise: Promise<void> | null = null

/**
 * Loads the Google Maps JS API once per page. Idempotent.
 * On resolve, the places library is available on `google.maps.places`.
 */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  if (isPlacesReady()) return Promise.resolve()

  if (loadPromise) return loadPromise

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
  if (!apiKey) {
    console.warn('[google-maps] NEXT_PUBLIC_GOOGLE_PLACES_KEY not set')
    return Promise.reject(new Error('Missing Google Places API key'))
  }

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src*="maps.googleapis.com/maps/api/js"]'
  )
  if (existing) {
    loadPromise = waitForExistingScript(existing)
    void loadPromise.catch(() => {
      loadPromise = null
    })
    return loadPromise
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&v=weekly`
    script.async = true
    script.defer = true
    script.onload = () => {
      if (isPlacesReady()) {
        resolve()
        return
      }
      void (async () => {
        try {
          await finishPlacesImport()
          resolve()
        } catch (err) {
          if (isPlacesReady()) {
            resolve()
            return
          }
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    }
    script.onerror = () => reject(new Error('Failed to load Google Maps script'))
    document.head.appendChild(script)
  })

  void loadPromise.catch(() => {
    loadPromise = null
  })

  return loadPromise
}

/**
 * Ensures Places is usable. Prefer `importLibrary('places')` when the modern
 * bootstrap exists; otherwise poll — Maps may have been loaded by a legacy
 * tag that never attached `importLibrary`.
 */
async function finishPlacesImport(): Promise<void> {
  if (isPlacesReady()) return

  const maps = window.google?.maps
  if (!maps) {
    throw new Error('google.maps unavailable')
  }

  if (getPlacesNamespace()) {
    let tries = 0
    while (tries < 80) {
      if (isPlacesReady()) return
      tries++
      await new Promise((r) => setTimeout(r, 25))
    }
    throw new Error('Google Maps places library never initialized')
  }

  if (typeof maps.importLibrary === 'function') {
    try {
      await maps.importLibrary('places')
    } catch {
      if (isPlacesReady()) return
    }
  }

  let tries = 0
  while (tries < 80) {
    if (isPlacesReady()) return
    tries++
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('Google Maps places library never initialized')
}

function waitForExistingScript(existing: HTMLScriptElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const afterLoadOrImport = () => {
      if (isPlacesReady()) {
        resolve()
        return
      }
      void (async () => {
        try {
          await finishPlacesImport()
          resolve()
        } catch (err) {
          if (isPlacesReady()) {
            resolve()
            return
          }
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    }
    const tryPoll = () => {
      if (isPlacesReady()) {
        resolve()
        return true
      }
      return false
    }
    if (tryPoll()) return

    let tries = 0
    const interval = setInterval(() => {
      tries++
      if (tryPoll()) clearInterval(interval)
      else if (tries > 200) {
        clearInterval(interval)
        reject(new Error('Google Maps existing script never ready'))
      }
    }, 50)

    existing.addEventListener(
      'load',
      () => {
        clearInterval(interval)
        afterLoadOrImport()
      },
      { once: true }
    )
    existing.addEventListener(
      'error',
      () => {
        clearInterval(interval)
        reject(new Error('Existing Google Maps script failed'))
      },
      { once: true }
    )
  })
}

export type AddressSuggestion = {
  placeId: string
  description: string
  mainText?: string
  secondaryText?: string
}

/**
 * Fetches autocomplete suggestions. Prefers AutocompleteSuggestion (Places API New);
 * falls back to AutocompleteService when needed.
 */
export async function fetchAddressSuggestions(input: string): Promise<AddressSuggestion[]> {
  if (!input || input.trim().length < 3) return []

  try {
    await loadGoogleMaps()
  } catch (err) {
    if (!isPlacesReady()) {
      console.warn('[google-maps] loadGoogleMaps failed:', err)
      return []
    }
  }

  const places = getPlacesNamespace()
  if (!places) return []

  const modern = places.AutocompleteSuggestion
  if (modern && typeof modern.fetchAutocompleteSuggestions === 'function') {
    try {
      const response = await modern.fetchAutocompleteSuggestions({
        input: input.trim(),
        includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
        includedRegionCodes: ['us'],
        locationBias: {
          south: CHICAGO_METRO_BOUNDS.south,
          west: CHICAGO_METRO_BOUNDS.west,
          north: CHICAGO_METRO_BOUNDS.north,
          east: CHICAGO_METRO_BOUNDS.east,
        },
      })
      const out: AddressSuggestion[] = []
      for (const item of response.suggestions ?? []) {
        const pred = item.placePrediction
        if (!pred?.placeId) continue
        const description =
          pred.text?.text ??
          [pred.mainText?.text, pred.secondaryText?.text].filter(Boolean).join(', ') ??
          ''
        if (!description) continue
        out.push({
          placeId: pred.placeId,
          description,
          mainText: pred.mainText?.text,
          secondaryText: pred.secondaryText?.text,
        })
      }
      if (out.length) return out
    } catch (err) {
      console.warn('[google-maps] AutocompleteSuggestion failed, falling back:', err)
    }
  }

  if (places.AutocompleteService) {
    const bounds = new google.maps.LatLngBounds(
      { lat: CHICAGO_METRO_BOUNDS.south, lng: CHICAGO_METRO_BOUNDS.west },
      { lat: CHICAGO_METRO_BOUNDS.north, lng: CHICAGO_METRO_BOUNDS.east }
    )

    return new Promise<AddressSuggestion[]>((resolve) => {
      try {
        const service = new places.AutocompleteService()
        service.getPlacePredictions(
          {
            input: input.trim(),
            componentRestrictions: { country: 'us' },
            types: ['address'],
            bounds,
          },
          (
            predictions: google.maps.places.AutocompletePrediction[] | null,
            status: google.maps.places.PlacesServiceStatus
          ) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
              resolve(
                predictions.map((p) => ({
                  placeId: p.place_id,
                  description: p.description,
                }))
              )
            } else {
              resolve([])
            }
          }
        )
      } catch (err) {
        console.warn('[google-maps] AutocompleteService failed:', err)
        resolve([])
      }
    })
  }

  return []
}

/**
 * Resolves a place id to address components for street + zip (same as legacy Autocomplete.getPlace).
 */
export function fetchPlaceDetailsForNavigation(placeId: string): Promise<PlacesAddressLike | null> {
  return (async () => {
    try {
      await loadGoogleMaps()
    } catch (err) {
      if (!isPlacesReady()) {
        console.warn('[google-maps] loadGoogleMaps failed:', err)
        return null
      }
    }

    return new Promise((resolve) => {
      if (typeof google === 'undefined' || !google.maps?.places) {
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
  })()
}
