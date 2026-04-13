'use client'

/**
 * Recent addresses under "Recent" match the desktop sidebar: both use
 * `getRecentSearches()` from `@/lib/recent-searches`, which reads the
 * `ps_recent_searches` cookie via `document.cookie` (see `addRecentSearch` /
 * `getRecentSearches` in that file). Same shape as AppSidebar: `RecentSearch[]`
 * with `address`, `slug`, `timestamp`.
 */

import { SignInButton, useClerk, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import BuildingLogoIcon from '@/components/BuildingLogoIcon'
import { getSidebarNavItems } from '@/components/sidebar-nav-items'
import { addressToSlug } from '@/lib/address-slug'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import { getRecentSearches, type RecentSearch } from '@/lib/recent-searches'
import { resolveStreetAndZipForNavigation } from '@/lib/google-places-address'
import { fetchPlaceDetailsForNavigation } from '@/lib/google-maps-loader'
import { useAddressAutocomplete, type AddressSuggestion } from '@/lib/use-address-autocomplete'

type MobileNavDrawerProps = {
  open: boolean
  onClose: () => void
  apiKey: string | undefined
}

function MobileDrawerSearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export default function MobileNavDrawer({ open, onClose, apiKey }: MobileNavDrawerProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const { signOut } = useClerk()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])

  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchValue, setSearchValue] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0)
  const { suggestions, clearSuggestions } = useAddressAutocomplete(apiKey ? searchValue : '')

  const safeHighlightedSuggestion =
    suggestions.length === 0 ? 0 : Math.min(highlightedSuggestion, suggestions.length - 1)

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const navItems = useMemo(() => getSidebarNavItems(isAdmin), [isAdmin])

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = ''
      return
    }
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    const recents = getRecentSearches()
    if (process.env.NODE_ENV === 'development') {
      console.log('[mobile drawer] recents:', recents)
    }
    setRecentSearches(recents)
  }, [pathname, open])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setIsAdmin(false)
      return
    }
    fetch('/api/profile/update')
      .then((res) => res.json())
      .then((data: { profile?: { role?: string | null } | null }) => {
        setIsAdmin(data.profile?.role === 'admin')
      })
      .catch(() => setIsAdmin(false))
  }, [isLoaded, isSignedIn])

  async function navigateToSuggestion(suggestion: AddressSuggestion) {
    const place = await fetchPlaceDetailsForNavigation(suggestion.placeId)
    const resolved = place ? resolveStreetAndZipForNavigation(searchValue, place) : null
    if (resolved?.street) {
      const slug = addressToSlug(resolved.street, resolved.zip)
      router.push(`/address/${encodeURIComponent(slug)}`)
    } else {
      const firstPart = suggestion.description.split(',')[0]?.trim() ?? ''
      if (firstPart) {
        router.push(`/address/${encodeURIComponent(addressToSlug(firstPart))}`)
      }
    }
    setSearchValue('')
    setSuggestionsOpen(false)
    clearSuggestions()
    searchInputRef.current?.blur()
    onClose()
  }

  function handleSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setHighlightedSuggestion((prev) => (prev + 1) % suggestions.length)
      setSuggestionsOpen(true)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setHighlightedSuggestion((prev) => (prev === 0 ? suggestions.length - 1 : prev - 1))
      setSuggestionsOpen(true)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestionsOpen && suggestions.length > 0) {
        void navigateToSuggestion(suggestions[safeHighlightedSuggestion])
        return
      }
      if (searchValue.trim()) {
        const slug = addressToSlug(searchValue.trim())
        router.push(`/address/${encodeURIComponent(slug)}`)
        setSearchValue('')
        setSuggestionsOpen(false)
        clearSuggestions()
        onClose()
      }
      return
    }
    if (e.key === 'Escape') {
      setSearchValue('')
      setSuggestionsOpen(false)
      clearSuggestions()
      searchInputRef.current?.blur()
    }
  }

  if (!open) return null

  const signOutModal =
    showSignOutConfirm &&
    typeof document !== 'undefined' &&
    createPortal(
      <div className="building-modal-overlay">
        <div className="building-modal" style={{ maxWidth: 320 }}>
          <button
            type="button"
            className="building-modal-x"
            onClick={() => setShowSignOutConfirm(false)}
            aria-label="Close"
          >
            &times;
          </button>
          <div className="building-modal-title" style={{ marginBottom: 8 }}>
            Sign out?
          </div>
          <div className="building-modal-subtitle" style={{ marginBottom: 16 }}>
            You&apos;ll need to sign in again to access your portfolio and saved properties.
          </div>
          <div className="building-modal-buttons">
            <button
              type="button"
              className="building-modal-btn building-modal-btn-navy"
              onClick={() => {
                signOut({ redirectUrl: '/' })
                setShowSignOutConfirm(false)
                onClose()
              }}
            >
              Sign out
            </button>
            <button
              type="button"
              className="building-modal-btn building-modal-btn-outline"
              onClick={() => setShowSignOutConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body
    )

  const drawer = (
    <div
      className="fixed inset-0 z-[9999] md:hidden mobile-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div className="mobile-drawer-panel">
        <div className="mobile-drawer-header">
          <Link href="/" className="mobile-drawer-brand" onClick={onClose}>
            <BuildingLogoIcon />
            <span className="mobile-drawer-brand-text">
              <span className="brand-wordmark-line">Property</span>
              <span className="brand-wordmark-line">Sentinel</span>
            </span>
          </Link>
          <button type="button" className="mobile-drawer-close" onClick={onClose} aria-label="Close menu">
            ×
          </button>
        </div>

        <div className="mobile-drawer-search">
          <div className="mobile-drawer-search-inner">
            <MobileDrawerSearchIcon />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search any address…"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value)
                setHighlightedSuggestion(0)
                setSuggestionsOpen(true)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => {
                setTimeout(() => setSuggestionsOpen(false), 150)
              }}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {suggestionsOpen && suggestions.length > 0 ? (
            <div className="mobile-drawer-suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <button
                  type="button"
                  key={s.placeId}
                  role="option"
                  aria-selected={i === safeHighlightedSuggestion}
                  className={
                    i === safeHighlightedSuggestion
                      ? 'mobile-drawer-suggestion mobile-drawer-suggestion-active'
                      : 'mobile-drawer-suggestion'
                  }
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    void navigateToSuggestion(s)
                  }}
                  onMouseEnter={() => setHighlightedSuggestion(i)}
                >
                  {s.description}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <nav className="mobile-drawer-nav">
          {navItems
            .filter((item) => !item.requiresAuth || isSignedIn)
            .map((item) => {
              const active = item.active ?? isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mobile-drawer-link${active ? ' mobile-drawer-link-active' : ''}`}
                  onClick={onClose}
                >
                  {item.icon}
                  <span className="mobile-drawer-link-label">{item.label}</span>
                  {item.badge === 'beta' ? (
                    <span className="sidebar-badge sidebar-badge-beta">BETA</span>
                  ) : null}
                  {item.badge === 'admin' ? (
                    <span className="sidebar-badge sidebar-badge-admin">ADMIN</span>
                  ) : null}
                </Link>
              )
            })}
        </nav>

        {recentSearches.length > 0 ? (
          <div className="mobile-drawer-recent">
            <div className="mobile-drawer-recent-label">Recent</div>
            {recentSearches.map((s) => (
              <Link
                key={s.slug}
                href={`/address/${s.slug}`}
                className="mobile-drawer-recent-link"
                onClick={onClose}
              >
                {formatAddressForDisplay(s.address || s.slug)}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mobile-drawer-footer">
          {isSignedIn ? (
            <button
              type="button"
              className="mobile-drawer-link mobile-drawer-link--footer"
              onClick={() => setShowSignOutConfirm(true)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="mobile-drawer-link-label">Sign out</span>
            </button>
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="mobile-drawer-link mobile-drawer-link--footer"
                onClick={onClose}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span className="mobile-drawer-link-label">Sign in or sign up</span>
              </button>
            </SignInButton>
          )}
        </div>
      </div>
      {signOutModal}
      <style>{`
        .mobile-drawer-overlay .sidebar-badge {
          font-family: var(--mono, 'DM Mono', monospace);
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.08em;
          padding: 1px 5px;
          border-radius: 3px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .mobile-drawer-overlay .sidebar-badge-beta {
          background: rgba(45, 122, 58, 0.15);
          color: #4ade80;
        }
        .mobile-drawer-overlay .sidebar-badge-admin {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(drawer, document.body)
  }
  return null
}
