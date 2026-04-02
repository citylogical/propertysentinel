'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { getRecentSearches, type RecentSearch } from '@/lib/recent-searches'

type SidebarTab = 'search' | 'portfolio' | 'account' | 'explore' | 'about' | 'blog'

type Props = {
  initialTab?: SidebarTab
}

export default function PropertySidebar({ initialTab = 'search' }: Props) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('ps-sidebar-open') === 'true'
  })
  const [sidebarAnimating, setSidebarAnimating] = useState(false)
  const isInitialMount = useRef(true)

  useEffect(() => {
    localStorage.setItem('ps-sidebar-open', String(isOpen))
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (isOpen) {
      setSidebarAnimating(true)
      const t = setTimeout(() => setSidebarAnimating(false), 350)
      return () => clearTimeout(t)
    }
  }, [isOpen])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [sidebarReady, setSidebarReady] = useState(false)
  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab)

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setSidebarReady(true), 350)
      return () => clearTimeout(t)
    }
    setSidebarReady(false)
  }, [isOpen])

  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const router = useRouter()
  const pathname = usePathname()
  const { user, isSignedIn, isLoaded } = useUser()
  const { signOut } = useClerk()

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    setRecentSearches(getRecentSearches())
  }, [pathname])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [isMobileMenuOpen])

  const [profileName, setProfileName] = useState('')
  const [profileOrg, setProfileOrg] = useState('')
  const [profileInitials, setProfileInitials] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setProfileName('')
      setProfileOrg('')
      setProfileInitials('')
      setIsAdmin(false)
      return
    }
    fetch('/api/profile/update')
      .then((res) => res.json())
      .then(
        (data: {
          profile?: {
            first_name?: string | null
            last_name?: string | null
            email?: string | null
            organization?: string | null
            role?: string | null
          } | null
        }) => {
          setIsAdmin(data.profile?.role === 'admin')
          if (data.profile) {
            const p = data.profile
            const first = p.first_name || ''
            const last = p.last_name || ''
            const name = [first, last].filter(Boolean).join(' ') || p.email || 'User'
            const initials =
              [first, last]
                .filter(Boolean)
                .map((n: string) => n[0]?.toUpperCase())
                .join('') || 'U'
            setProfileName(name)
            setProfileOrg(p.organization || '')
            setProfileInitials(initials)
          } else {
            setProfileName('')
            setProfileOrg('')
            setProfileInitials('')
          }
        }
      )
      .catch(() => {})
  }, [isLoaded, isSignedIn])

  const displayName =
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'User'
  const avatarLetter = (user?.firstName?.[0] || user?.primaryEmailAddress?.emailAddress?.[0] || 'U').toUpperCase()
  const footerName = profileName || displayName
  const footerInitials = profileInitials || avatarLetter

  return (
    <div
      className={`prop-sidebar ${isOpen ? `prop-sidebar-expanded${sidebarReady ? ' sidebar-ready' : ''}${sidebarAnimating ? ' sidebar-animating' : ''}` : 'prop-sidebar-collapsed'}`}
    >
      <button
        type="button"
        className="prop-sidebar-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isOpen ? (
          <span className="prop-sidebar-toggle-minus">{'\u2212'}</span>
        ) : (
          <span className="prop-sidebar-toggle-ps-wrap">
            <span className="prop-sidebar-toggle-ps">PS</span>
            <span className="prop-sidebar-toggle-plus">+</span>
          </span>
        )}
      </button>

      {/* ── Mobile header bar ── */}
      <div className="prop-mobile-header">
        <Link href="/" className="prop-mobile-brand">Property Sentinel</Link>
        <button
          type="button"
          className="prop-mobile-hamburger"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <span /><span /><span />
        </button>
      </div>

      {/* ── Mobile nav drawer (slides from right ≤768px; see globals.css) ── */}
      {isMobileMenuOpen && (
        <div
          className="prop-mobile-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div className="prop-mobile-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="prop-mobile-overlay-top">
              <Link href="/" className="prop-mobile-overlay-brand" onClick={() => setIsMobileMenuOpen(false)}>
                Property Sentinel
              </Link>
              <button
                type="button"
                className="prop-mobile-overlay-close"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="prop-mobile-overlay-nav">
              <button
                type="button"
                className="prop-mobile-overlay-item"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  const recent = getRecentSearches()
                  if (recent.length > 0) {
                    router.push(`/address/${encodeURIComponent(recent[0].slug)}`)
                  } else {
                    router.push('/search')
                  }
                }}
              >
                <span>Property search</span>
                <span className="prop-mobile-overlay-chevron">›</span>
              </button>
              <button
                type="button"
                className="prop-mobile-overlay-item"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  router.push('/portfolio')
                }}
              >
                <span>Portfolio</span>
                <span className="prop-mobile-overlay-chevron">›</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="prop-mobile-overlay-item"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    router.push('/explore')
                  }}
                >
                  <span>Explore</span>
                  <span className="prop-mobile-overlay-chevron">›</span>
                </button>
              )}
              <button
                type="button"
                className="prop-mobile-overlay-item"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  router.push('/blog')
                }}
              >
                <span>Blog</span>
                <span className="prop-mobile-overlay-chevron">›</span>
              </button>
              <button
                type="button"
                className="prop-mobile-overlay-item"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  router.push('/about')
                }}
              >
                <span>About</span>
                <span className="prop-mobile-overlay-chevron">›</span>
              </button>
              <button
                type="button"
                className="prop-mobile-overlay-item"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  router.push('/profile')
                }}
              >
                <span>Account</span>
                <span className="prop-mobile-overlay-chevron">›</span>
              </button>
              <button
                type="button"
                className="prop-mobile-overlay-item"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  router.push('/status')
                }}
              >
                <span>System status</span>
                <span className="prop-mobile-overlay-chevron">›</span>
              </button>
            </nav>
            <div className="prop-mobile-overlay-footer">
              {isSignedIn ? (
                <button
                  type="button"
                  className="prop-mobile-overlay-signout"
                  onClick={() => signOut({ redirectUrl: '/' })}
                >
                  Sign out
                </button>
              ) : (
                <Link
                  href="/sign-in"
                  className="prop-mobile-overlay-signin"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {isOpen ? (
        <>
          <div className="prop-sidebar-header">
            <Link href="/" className="prop-sidebar-brand">
              Property Sentinel
            </Link>
          </div>

          <div className="prop-sidebar-nav">
            <button
              type="button"
              className={`prop-sidebar-nav-item ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('search')
                const recent = getRecentSearches()
                if (recent.length > 0) {
                  router.push(`/address/${encodeURIComponent(recent[0].slug)}`)
                } else {
                  router.push('/search')
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Property search
            </button>
            <button
              type="button"
              className={`prop-sidebar-nav-item ${activeTab === 'portfolio' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('portfolio')
                router.push('/portfolio')
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Portfolio
            </button>
            {isAdmin && (
              <button
                type="button"
                className={`prop-sidebar-nav-item ${activeTab === 'explore' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('explore')
                  router.push('/explore')
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                Explore
              </button>
            )}
            <button
              type="button"
              className={`prop-sidebar-nav-item ${activeTab === 'blog' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('blog')
                router.push('/blog')
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" />
                <path d="M4 8h16" />
                <path d="M8 4v4" />
                <path d="M7 12h6" />
                <path d="M7 16h10" />
              </svg>
              Blog
            </button>
            <button
              type="button"
              className={`prop-sidebar-nav-item ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('about')
                router.push('/about')
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              About
            </button>
            <button
              type="button"
              className={`prop-sidebar-nav-item ${activeTab === 'account' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('account')
                router.push('/profile')
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Account
            </button>
          </div>

          <div className="prop-sidebar-content">
            <div className="prop-sidebar-section">
              <div className="prop-sidebar-section-label">Recent</div>
              <div className="prop-sidebar-recent-list">
                {recentSearches.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', padding: '8px 0' }}>
                    No recent searches
                  </div>
                ) : (
                  recentSearches.slice(0, 4).map((s) => (
                    <Link
                      key={s.slug}
                      href={`/address/${encodeURIComponent(s.slug)}`}
                      className="prop-sidebar-recent-item"
                    >
                      {s.address}
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Saved properties — dormant for now
            {activeTab === 'portfolio' && (
              <div className="prop-sidebar-section">
                <div className="prop-sidebar-section-label">Saved properties</div>
                ...
              </div>
            )}
            */}
          </div>

          <div className="prop-sidebar-footer">
            {isSignedIn ? (
              <Link href="/profile" className="prop-sidebar-user" style={{ textDecoration: 'none', cursor: 'pointer' }} onClick={() => setActiveTab('account')}>
                <div className="prop-sidebar-avatar">{footerInitials}</div>
                <div>
                  <div className="prop-sidebar-username">{footerName}</div>
                  {profileOrg && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{profileOrg}</div>
                  )}
                </div>
              </Link>
            ) : (
              <Link href="/sign-in" className="prop-sidebar-signin">
                Sign in
              </Link>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
