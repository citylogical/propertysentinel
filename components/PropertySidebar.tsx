'use client'

import { SignInButton, useClerk, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getRecentSearches, type RecentSearch } from '@/lib/recent-searches'

type SidebarTab = 'search' | 'portfolio' | 'account'

type Props = {
  initialTab?: SidebarTab
}

export default function PropertySidebar({ initialTab = 'search' }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const router = useRouter()
  const pathname = usePathname()
  const { user, isSignedIn } = useUser()
  const { signOut } = useClerk()

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    setRecentSearches(getRecentSearches())
  }, [pathname])

  const displayName =
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'User'
  const avatarLetter = (user?.firstName?.[0] || user?.primaryEmailAddress?.emailAddress?.[0] || 'U').toUpperCase()

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
                <div className="prop-sidebar-section-label">Saved Properties</div>
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px',
                      padding: '6px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      fontSize: 9,
                      fontFamily: 'var(--mono)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    <span>Address</span>
                    <span style={{ textAlign: 'right' }}>Alerts</span>
                  </div>
                  <div
                    style={{
                      padding: '24px 0',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                      Add your first property
                    </div>
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
                </div>
              </div>
            )}
          </div>

          <div className="prop-sidebar-footer">
            <div className="prop-sidebar-user">
              <div className="prop-sidebar-avatar">{isSignedIn ? avatarLetter : '?'}</div>
              <div>
                <div className="prop-sidebar-username">{isSignedIn ? displayName : 'Guest'}</div>
                {isSignedIn ? (
                  <button
                    type="button"
                    className="prop-sidebar-signout"
                    onClick={() => signOut({ redirectUrl: '/' })}
                  >
                    Sign out
                  </button>
                ) : (
                  <SignInButton mode="modal">
                    <button type="button" className="prop-sidebar-signout">
                      Sign in
                    </button>
                  </SignInButton>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
