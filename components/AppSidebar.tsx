'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { SignInButton, useClerk, useUser } from '@clerk/nextjs'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { addressToSlug } from '@/lib/address-slug'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import { resolveStreetAndZipForNavigation } from '@/lib/google-places-address'
import { getRecentSearches } from '@/lib/recent-searches'
import { fetchPlaceDetailsForNavigation } from '@/lib/google-maps-loader'
import { useAddressAutocomplete, type AddressSuggestion } from '@/lib/use-address-autocomplete'
import BuildingLogoIcon from '@/components/BuildingLogoIcon'
import { getSidebarNavItems } from '@/components/sidebar-nav-items'

export default function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const { signOut } = useClerk()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [recentSearches, setRecentSearches] = useState<{ address: string; slug: string }[]>([])
  const [maxRecent, setMaxRecent] = useState(4)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchValue, setSearchValue] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0)
  const { suggestions, clearSuggestions } = useAddressAutocomplete(searchValue)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [railPinned, setRailPinned] = useState(false)

  const expandRailForSearch = useCallback(() => {
    setRailPinned(true)
    globalThis.setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 280)
  }, [])

  useEffect(() => {
    function handleKeydown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        expandRailForSearch()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [expandRailForSearch])

  function handleSidebarMouseLeave() {
    if (document.activeElement !== searchInputRef.current) {
      setRailPinned(false)
    }
  }

  function handleNavSearchPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.target === searchInputRef.current) return
    const w = sidebarRef.current?.offsetWidth ?? 200
    if (w <= 52) {
      e.preventDefault()
      expandRailForSearch()
    }
  }

  const safeHighlightedSuggestion =
    suggestions.length === 0 ? 0 : Math.min(highlightedSuggestion, suggestions.length - 1)

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

  useEffect(() => {
    setRecentSearches(getRecentSearches())
  }, [pathname])

  useEffect(() => {
    const calculateMax = () => {
      if (!navRef.current || !footerRef.current) return
      const sidebarHeight = window.innerHeight
      const navBottom = navRef.current.getBoundingClientRect().bottom
      const footerHeight = footerRef.current.getBoundingClientRect().height
      const available = sidebarHeight - navBottom - footerHeight - 40
      const perItem = 28
      const fits = Math.max(0, Math.floor(available / perItem))
      setMaxRecent(Math.min(4, fits))
    }

    calculateMax()
    window.addEventListener('resize', calculateMax)
    return () => window.removeEventListener('resize', calculateMax)
  }, [recentSearches, isAdmin, isSignedIn])

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

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const navItems = useMemo(() => getSidebarNavItems(isAdmin), [isAdmin])

  if (pathname?.startsWith('/audit')) return null

  return (
    <div
      ref={sidebarRef}
      className={`app-sidebar${railPinned ? ' app-sidebar--pinned' : ''}`}
      onMouseLeave={handleSidebarMouseLeave}
    >
      <style>{`
        .sidebar-badge {
          font-family: var(--mono, 'DM Mono', monospace);
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.08em;
          padding: 1px 5px;
          border-radius: 3px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .sidebar-badge-beta {
          background: rgba(45, 122, 58, 0.15);
          color: #4ade80;
        }
        .sidebar-badge-admin {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
      <div className="app-sidebar-logo">
        <Link href="/" className="app-sidebar-logo-link" aria-label="Property Sentinel home">
          <span className="app-sidebar-logo-icon" aria-hidden="true">
            <BuildingLogoIcon width={22} height={38} />
          </span>
          <span className="app-sidebar-logo-text">
            <span className="brand-wordmark-line">Property</span>
            <span className="brand-wordmark-line">Sentinel</span>
          </span>
        </Link>
      </div>

      <div className="app-sidebar-divider" aria-hidden />

      <nav className="app-sidebar-nav">
        <div ref={navRef}>
          <div
            className="app-sidebar-nav-search"
            onPointerDown={handleNavSearchPointerDown}
            role="search"
          >
            <div className="app-sidebar-nav-search-inner">
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
              <div className="app-sidebar-search-suggestions" role="listbox">
                {suggestions.map((s, idx) => (
                  <button
                    type="button"
                    key={s.placeId}
                    role="option"
                    aria-selected={idx === safeHighlightedSuggestion}
                    className={
                      idx === safeHighlightedSuggestion
                        ? 'app-sidebar-suggestion app-sidebar-suggestion-active'
                        : 'app-sidebar-suggestion'
                    }
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      void navigateToSuggestion(s)
                    }}
                    onMouseEnter={() => setHighlightedSuggestion(idx)}
                  >
                    {s.description}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {navItems.filter((item) => !item.requiresAuth || isSignedIn).map((item) => {
            const active = item.active ?? isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-sidebar-link ${active ? 'app-sidebar-link-active' : ''}`}
              >
                <span className="app-sidebar-link-icon">{item.icon}</span>
                <span className="app-sidebar-link-body">
                  <span className="app-sidebar-link-label">{item.label}</span>
                  {item.badge === 'beta' ? (
                    <span className="sidebar-badge sidebar-badge-beta">BETA</span>
                  ) : null}
                  {item.badge === 'admin' ? (
                    <span className="sidebar-badge sidebar-badge-admin">ADMIN</span>
                  ) : null}
                </span>
              </Link>
            )
          })}
        </div>
        {recentSearches.length > 0 && maxRecent > 0 && (
          <div className="app-sidebar-recent" ref={recentRef}>
            <div className="app-sidebar-recent-label">Recent</div>
            {recentSearches.slice(0, maxRecent).map((s) => (
              <Link key={s.slug} href={`/address/${s.slug}`} className="app-sidebar-recent-link">
                <span className="app-sidebar-recent-text">
                  {formatAddressForDisplay(s.address || s.slug)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="app-sidebar-footer" ref={footerRef}>
        {isSignedIn ? (
          <button type="button" className="app-sidebar-footer-link" onClick={() => setShowSignOutConfirm(true)}>
            <span className="app-sidebar-footer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span className="app-sidebar-footer-label">Sign out</span>
          </button>
        ) : (
          <SignInButton mode="modal">
            <button type="button" className="app-sidebar-footer-link">
              <span className="app-sidebar-footer-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </span>
              <span className="app-sidebar-footer-label">Sign in or sign up</span>
            </button>
          </SignInButton>
        )}
      </div>

      {showSignOutConfirm &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="building-modal-overlay">
            <div className="building-modal" style={{ maxWidth: 320 }}>
              <button type="button" className="building-modal-x" onClick={() => setShowSignOutConfirm(false)} aria-label="Close">
                &times;
              </button>
              <div className="building-modal-title" style={{ marginBottom: 8 }}>
                Sign out?
              </div>
              <div className="building-modal-subtitle" style={{ marginBottom: 16 }}>
                You&apos;ll need to sign in again to access your dashboard and saved properties.
              </div>
              <div className="building-modal-buttons">
                <button
                  type="button"
                  className="building-modal-btn building-modal-btn-navy"
                  onClick={() => {
                    signOut({ redirectUrl: '/' })
                    setShowSignOutConfirm(false)
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
        )}
    </div>
  )
}
