/**
 * Google Places Autocomplete → street line + zip for Property Sentinel navigation.
 * Avoids using formatted_address when street_number is missing (route-only suggestions).
 */

export type PlacesAddressLike = {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  formatted_address?: string
  types?: string[]
}

/** Metro area: Chicago + Cook collar (Park Ridge, Evanston, etc.). Old bounds cut off north of ~41.97°. */
export const CHICAGO_METRO_BOUNDS = {
  north: 42.2,
  south: 41.45,
  east: -87.52,
  west: -88.35,
}

const LEADING_STREET_NUMBER = /^(\d+[A-Za-z0-9\-]*)\s+/

function componentMap(components: PlacesAddressLike['address_components']): Record<string, string> {
  const map: Record<string, string> = {}
  for (const c of components ?? []) {
    for (const t of c.types) {
      map[t] = c.long_name
    }
  }
  return map
}

export function parsePlacesStreetCoreAndZip(place: PlacesAddressLike): {
  streetCore: string
  zip: string | null
  hasStreetNumber: boolean
} {
  const map = componentMap(place.address_components)
  const streetNumber = map.street_number ?? ''
  const route = map.route ?? ''
  const streetCore = [streetNumber, route].filter(Boolean).join(' ').trim()
  const zip = map.postal_code && /^\d{5}$/.test(map.postal_code) ? map.postal_code : null
  return {
    streetCore,
    zip,
    hasStreetNumber: streetNumber.trim() !== '',
  }
}

/**
 * If Places returned only a route (no street_number on components), prepend the number
 * the user typed (e.g. "1435 S Pros..." + "South Prospect Avenue" → "1435 South Prospect Avenue").
 */
export function mergeTypedLeadingStreetNumber(typedInput: string, streetCore: string): string {
  const core = streetCore.trim()
  const typed = typedInput.trim()
  if (!core) return typed
  if (/^\d/.test(core)) return core
  const m = typed.match(LEADING_STREET_NUMBER)
  if (m) return `${m[1]} ${core}`.replace(/\s+/g, ' ').trim()
  return core
}

export function resolveStreetAndZipForNavigation(
  lastTypedInput: string,
  place: PlacesAddressLike
): { street: string; zip: string | null } | null {
  if (!place.address_components?.length && !place.formatted_address) return null

  const { streetCore, zip } = parsePlacesStreetCoreAndZip(place)
  const street = mergeTypedLeadingStreetNumber(lastTypedInput, streetCore)

  if (!street.trim()) {
    const t = lastTypedInput.trim()
    if (t && LEADING_STREET_NUMBER.test(t)) return { street: t, zip }
    return null
  }

  return { street, zip }
}
