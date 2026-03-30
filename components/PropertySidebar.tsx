'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getRecentSearches, type RecentSearch } from '@/lib/recent-searches'

type SidebarTab = 'search' | 'portfolio' | 'account' | 'explore'

type Props = {
  initialTab?: SidebarTab
}

type SavedPropertyPreview = {
  id: string
  slug: string
  display_name: string | null
  address_range: string | null
  canonical_address: string
  alerts_enabled: boolean
}

export default function PropertySidebar({ initialTab = 'search' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const [savedProperties, setSavedProperties] = useState<SavedPropertyPreview[]>([])
  const [loadingSaved, setLoadingSaved] = useState(false)
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
    if (activeTab !== 'portfolio' || !isLoaded) return
    if (!isSignedIn) {
      setSavedProperties([])
      setLoadingSaved(false)
      return
    }
    setLoadingSaved(true)
    fetch('/api/portfolio/list')
      .then((res) => res.json())
      .then((data: { error?: string; properties?: SavedPropertyPreview[] }) => {
        if (data.error) {
          setSavedProperties([])
          return
        }
        setSavedProperties((data.properties ?? []).slice(0, 4))
      })
      .catch(() => setSavedProperties([]))
      .finally(() => setLoadingSaved(false))
  }, [activeTab, isSignedIn, isLoaded])

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
    <div className={`prop-sidebar ${isOpen ? 'prop-sidebar-expanded' : 'prop-sidebar-collapsed'}`}>
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
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open menu"
        >
          <span /><span /><span />
        </button>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {isOpen && (
        <div className="prop-mobile-drawer-backdrop" onClick={() => setIsOpen(false)}>
          <div className="prop-mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="prop-mobile-drawer-header">
              <Link href="/" className="prop-sidebar-brand" onClick={() => setIsOpen(false)}>
                Property Sentinel
              </Link>
              <button
                type="button"
                className="prop-mobile-drawer-close"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="prop-mobile-drawer-nav">
              <button
                type="button"
                className={`prop-sidebar-nav-item ${activeTab === 'search' ? 'active' : ''}`}
                onClick={() => {
                  setIsOpen(false)
                  setActiveTab('search')
                  const recent = getRecentSearches()
                  if (recent.length > 0) {
                    router.push(`/address/${encodeURIComponent(recent[0].slug)}`)
                  } else {
                    router.push('/search')
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                Property search
              </button>
              <button
                type="button"
                className={`prop-sidebar-nav-item ${activeTab === 'portfolio' ? 'active' : ''}`}
                onClick={() => { setIsOpen(false); router.push('/portfolio') }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                Portfolio
              </button>
              <button
                type="button"
                className={`prop-sidebar-nav-item ${activeTab === 'account' ? 'active' : ''}`}
                onClick={() => { setIsOpen(false); router.push('/profile') }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                Account
              </button>
            </div>
            {isSignedIn && (
              <div className="prop-mobile-drawer-footer">
                <div className="prop-sidebar-user">
                  <div className="prop-sidebar-avatar">{footerInitials}</div>
                  <div>
                    <div className="prop-sidebar-username">{footerName}</div>
                    {profileOrg && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{profileOrg}</div>}
                    <button type="button" className="prop-sidebar-signout" onClick={() => signOut({ redirectUrl: '/' })}>Sign out</button>
                  </div>
                </div>
              </div>
            )}
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
            <div className="prop-sidebar-nav-label">Navigation</div>
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
              onClick={() => setActiveTab('portfolio')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Portfolio
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
          </div>

          <div className="prop-sidebar-content">
            {activeTab === 'search' && (
              <div className="prop-sidebar-section">
                <div className="prop-sidebar-section-label">Recent</div>
                <div className="prop-sidebar-recent-list">
                  {recentSearches.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', padding: '8px 0' }}>
                      No recent searches
                    </div>
                  ) : (
                    recentSearches.map((s) => (
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
            )}

            {activeTab === 'portfolio' && (
              <div className="prop-sidebar-section">
                <div className="prop-sidebar-section-label">Saved properties</div>
                <div className="prop-sidebar-recent-list">
                  {!isLoaded ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', padding: '8px 0' }}>Loading...</div>
                  ) : !isSignedIn ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', padding: '8px 0' }}>
                      Sign in to see saved properties
                    </div>
                  ) : loadingSaved ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', padding: '8px 0' }}>Loading...</div>
                  ) : savedProperties.length === 0 ? (
                    <div style={{ padding: '16px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Add your first property</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', lineHeight: 1.4 }}>
                        Use the{' '}
                        <span style={{ display: 'inline-flex', verticalAlign: 'middle', margin: '0 2px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>{' '}
                        button on any property
                      </div>
                    </div>
                  ) : (
                    <>
                      {savedProperties.map((p) => (
                        <Link
                          key={p.id}
                          href={`/address/${encodeURIComponent(p.slug)}`}
                          className="prop-sidebar-recent-item"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                        >
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.display_name || p.address_range || p.canonical_address}
                          </span>
                          {p.alerts_enabled && (
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#2d6a4f',
                                flexShrink: 0,
                              }}
                              aria-hidden
                            />
                          )}
                        </Link>
                      ))}
                      <Link
                        href="/portfolio"
                        style={{
                          display: 'block',
                          textAlign: 'center',
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.4)',
                          padding: '10px 0 2px',
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                        }}
                      >
                        View all
                      </Link>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="prop-sidebar-footer">
            {isSignedIn ? (
              <div className="prop-sidebar-user">
                <div className="prop-sidebar-avatar">{footerInitials}</div>
                <div>
                  <div className="prop-sidebar-username">{footerName}</div>
                  {profileOrg && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{profileOrg}</div>
                  )}
                  <button type="button" className="prop-sidebar-signout" onClick={() => signOut({ redirectUrl: '/' })}>
                    Sign out
                  </button>
                </div>
              </div>
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
