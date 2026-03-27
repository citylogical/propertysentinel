const COOKIE_NAME = 'ps_recent_searches'
const MAX_RECENT = 5

export type RecentSearch = {
  address: string
  slug: string
  timestamp: number
}

/** Read recent searches from the cookie. */
export function getRecentSearches(): RecentSearch[] {
  if (typeof document === 'undefined') return []
  try {
    const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`))
    if (!match) return []
    const decoded = decodeURIComponent(match.split('=').slice(1).join('='))
    const parsed = JSON.parse(decoded)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

/** Add a search to the recent list. Deduplicates by slug. Keeps most recent MAX_RECENT. */
export function addRecentSearch(address: string, slug: string): void {
  if (typeof document === 'undefined') return
  const existing = getRecentSearches()
  const filtered = existing.filter((s) => s.slug !== slug)
  const updated = [{ address, slug, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT)
  const encoded = encodeURIComponent(JSON.stringify(updated))
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${COOKIE_NAME}=${encoded}; path=/; expires=${expires}; SameSite=Lax`
}
