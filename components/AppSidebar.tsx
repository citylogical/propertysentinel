'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignInButton, useClerk, useUser } from '@clerk/nextjs'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getRecentSearches } from '@/lib/recent-searches'

type NavItem = {
  label: string
  href: string
  icon: ReactNode
  active?: boolean
  badge?: 'beta' | 'admin'
  /** When true, link is shown only to signed-in users (e.g. Account). */
  requiresAuth?: boolean
}

export default function AppSidebar() {
  const pathname = usePathname()
  const { isSignedIn, isLoaded } = useUser()
  const { signOut } = useClerk()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [recentSearches, setRecentSearches] = useState<{ address: string; slug: string }[]>([])
  const [maxRecent, setMaxRecent] = useState(4)
  const navRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

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

  const navItems = useMemo((): NavItem[] => {
    const items: NavItem[] = [
      {
        label: 'Property search',
        href: '/search',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        ),
        active: pathname === '/search' || pathname.startsWith('/address/'),
      },
      {
        label: 'Portfolio',
        href: '/portfolio',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
    ]

    if (isAdmin) {
      items.push({
        label: 'Explore',
        href: '/explore',
        badge: 'admin',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        ),
      })
    }

    items.push({
      label: 'Leads',
      href: '/leads',
      badge: 'beta',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
      ),
    })

    items.push(
      {
        label: 'Blog',
        href: '/blog',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
          </svg>
        ),
      },
      {
        label: 'About',
        href: '/about',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 10h2" />
            <path d="M16 14h2" />
            <path d="M6.17 15a3 3 0 0 1 5.66 0" />
            <circle cx="9" cy="11" r="2" />
            <rect x="2" y="5" width="20" height="14" rx="2" />
          </svg>
        ),
      },
      {
        label: 'Status',
        href: '/status',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
      },
      {
        label: 'Account',
        href: '/profile',
        requiresAuth: true,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ),
      }
    )

    return items
  }, [isAdmin, pathname])

  return (
    <div className="app-sidebar">
      <style>{`
        .sidebar-badge {
          font-family: var(--mono, 'DM Mono', monospace);
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.08em;
          padding: 1px 5px;
          border-radius: 3px;
          margin-left: 6px;
          vertical-align: middle;
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
            <svg width="22" height="38" viewBox="0 0 50 90" fill="none" stroke="white" strokeWidth="1.2" xmlns="http://www.w3.org/2000/svg">
              <line x1="25" y1="0" x2="25" y2="8" />
              <path d="M19 14 Q25 5 31 14" />
              <rect x="18" y="14" width="14" height="24" />
              <line x1="23" y1="14" x2="23" y2="38" />
              <line x1="27" y1="14" x2="27" y2="38" />
              <line x1="7" y1="34" x2="7" y2="38" />
              <path d="M4 38 Q7 32 10 38" />
              <line x1="43" y1="34" x2="43" y2="38" />
              <path d="M40 38 Q43 32 46 38" />
              <rect x="4" y="38" width="42" height="42" />
              <line x1="14" y1="38" x2="14" y2="80" />
              <line x1="25" y1="38" x2="25" y2="80" />
              <line x1="36" y1="38" x2="36" y2="80" />
              <line x1="4" y1="80" x2="46" y2="80" />
            </svg>
          </span>
          <span className="app-sidebar-logo-text">
            <span className="brand-wordmark-line">Property</span>
            <span className="brand-wordmark-line">Sentinel</span>
          </span>
        </Link>
      </div>

      <nav className="app-sidebar-nav">
        <div ref={navRef}>
          {navItems.filter((item) => !item.requiresAuth || isSignedIn).map((item) => {
            const active = item.active ?? isActive(item.href)
            const href =
              item.href === '/search'
                ? recentSearches.length > 0
                  ? `/address/${recentSearches[0].slug}`
                  : '/search'
                : item.href
            return (
              <Link
                key={item.href}
                href={href}
                className={`app-sidebar-link ${active ? 'app-sidebar-link-active' : ''}`}
              >
                <span className="app-sidebar-link-icon">{item.icon}</span>
                <span className="app-sidebar-link-label">
                  {item.label}
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
                <span className="app-sidebar-recent-text">{s.address}</span>
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
              <span className="app-sidebar-footer-label">Sign in</span>
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
                You&apos;ll need to sign in again to access your portfolio and saved properties.
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
