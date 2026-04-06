// Converts an address slug (lowercase, dash-separated) OR a raw
// normalized address (lowercase, space-separated) into Title Case
// for display in headers and UI text.
//
// Handles Chicago street name quirks: directional abbreviations
// (N, S, E, W, NE, NW, SE, SW) stay uppercase; ordinal suffixes
// (1st, 2nd, 3rd, 14th) stay lowercase; "McKinley" / "LaSalle"
// style names get special-case title casing.

const DIRECTIONALS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])

const STREET_SUFFIXES = new Set([
  'st',
  'ave',
  'blvd',
  'dr',
  'rd',
  'ln',
  'pl',
  'ct',
  'ter',
  'way',
  'pkwy',
  'cir',
  'hwy',
  'plz',
  'sq',
  'trl',
  'expy',
  'row',
])

const CHICAGO_MIXED_CASE: Record<string, string> = {
  lasalle: 'LaSalle',
  mclean: 'McLean',
  mckinley: 'McKinley',
  mccormick: 'McCormick',
  macarthur: 'MacArthur',
  desplaines: 'DesPlaines',
  devon: 'Devon',
  ohare: "O'Hare",
}

function titleCaseWord(word: string): string {
  const lower = word.toLowerCase()

  if (DIRECTIONALS.has(lower)) return lower.toUpperCase()

  if (STREET_SUFFIXES.has(lower)) {
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }

  if (CHICAGO_MIXED_CASE[lower]) return CHICAGO_MIXED_CASE[lower]

  const ordinalMatch = word.match(/^(\d+)(st|nd|rd|th)$/i)
  if (ordinalMatch) {
    return ordinalMatch[1] + ordinalMatch[2].toLowerCase()
  }

  if (/^\d+$/.test(word)) return word

  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * Convert an address slug or normalized address to display format.
 * Accepts: "1120-n-lasalle-dr" OR "1120 n lasalle dr" OR "1120 N LASALLE DR"
 * Returns: "1120 N LaSalle Dr"
 */
export function formatAddressForDisplay(addressOrSlug: string): string {
  if (!addressOrSlug) return ''

  const normalized = addressOrSlug
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
    .split(' ')
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ')
}

/**
 * Convert a display address to a URL-safe slug for routing.
 * "1120 N LaSalle Dr" → "1120-n-lasalle-dr"
 */
export function addressToSlug(displayAddress: string): string {
  return displayAddress
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}
