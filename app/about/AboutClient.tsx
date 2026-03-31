'use client'

import { useState, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

/* ────────────────────────────────────────────────────────────────────
   FEATURE DATA (static — these don't need a database)
   ──────────────────────────────────────────────────────────────────── */

type Feature = {
  category: string
  headline: string
  description: string
  example: { title: string; lines: string[] }
}

const FEATURES: Feature[] = [
  {
    category: '311 complaints',
    headline: 'Know the moment it’s filed',
    description:
      'Every complaint ingested within 30 minutes. Heating, rodents, building violations, shared housing — 13M records, searchable by address.',
    example: {
      title: '5540 S Hyde Park Blvd',
      lines: [
        'Building Violation — Mar 4, 2026 · Open',
        'Heating Complaint — Jan 12, 2026 · Completed',
        'Rodent Baiting — Nov 8, 2025 · Completed',
        '134 total complaints on record',
      ],
    },
  },
  {
    category: 'Building resolution',
    headline: 'One building, one record',
    description:
      'Multiple addresses, multiple PINs — resolved automatically into a single unified property view.',
    example: {
      title: '1112–1134 N La Salle & 153–163 W Elm',
      lines: [
        '12 PINs resolved across 2 street addresses',
        'All complaints unified regardless of entrance',
        'Assessed values summed: $6.6M implied',
        'No other tool does this',
      ],
    },
  },
  {
    category: 'Violations & permits',
    headline: 'The full enforcement picture',
    description:
      'Inspector comments, inspection grouping, 540-day expiration tracking. Stop work orders flagged immediately.',
    example: {
      title: 'Inspection #14923847',
      lines: [
        'Failed porch — wood deteriorated beyond repair',
        'Handrails missing, rear staircase 2nd–3rd floor',
        'Stop work order issued — permit #100924618',
        'Cure deadline: 15 days from notice',
      ],
    },
  },
  {
    category: 'STR intelligence',
    headline: '76% have a compliance gap',
    description:
      'Airbnb listings cross-referenced against BACP registrations, the Prohibited Buildings List, and SHVR complaints.',
    example: {
      title: '70 E Cedar St · Prohibited Building',
      lines: [
        '14 Airbnb listings detected within 150m',
        '7 SHVR complaints filed, 1 currently open',
        'Registration R22000094076 expired Oct 2024',
        'Operator likely unaware of filing',
      ],
    },
  },
  {
    category: 'Assessment data',
    headline: 'Two years ahead of the county',
    description:
      '2025 assessed values for all 1.86M parcels. The Cook County website still shows 2023.',
    example: {
      title: 'PIN 17-04-207-086-1001',
      lines: [
        '2025 Mailed Total: $28,450',
        'Class 299 — Condo, 10% assessment level',
        'Implied Market Value: $284,500',
        'CCAO website still shows 2023: $24,100',
      ],
    },
  },
  {
    category: 'Monitoring',
    headline: 'Your building, watched',
    description:
      'Save any property. Weekly digests free. Hourly SMS alerts on premium. The window between filing and inspection is everything.',
    example: {
      title: 'Weekly digest — 344 W Concord Pl',
      lines: [
        '2 new 311 complaints filed this week',
        '1 permit status changed to ISSUED',
        'No new violations',
        'Upgrade to Premium for hourly SMS alerts',
      ],
    },
  },
]

/* ────────────────────────────────────────────────────────────────────
   TYPES
   ──────────────────────────────────────────────────────────────────── */

type Tab = 'features' | 'pricing' | 'blog' | 'contact'

type BlogPostSummary = {
  slug: string
  title: string
  date_label: string
}

type BlogPostFull = {
  slug: string
  title: string
  date_label: string
  body: string
}

/* ────────────────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────────────────── */

export default function AboutClient() {
  const [activeTab, setActiveTab] = useState<Tab>('features')
  const [featureModal, setFeatureModal] = useState<number | null>(null)

  // Blog state
  const [blogPosts, setBlogPosts] = useState<BlogPostSummary[]>([])
  const [blogLoading, setBlogLoading] = useState(false)
  const [readingSlug, setReadingSlug] = useState<string | null>(null)
  const [currentPost, setCurrentPost] = useState<BlogPostFull | null>(null)
  const [postLoading, setPostLoading] = useState(false)

  // Pricing state
  const [isAnnual, setIsAnnual] = useState(false)
  const [propertyCount, setPropertyCount] = useState(3)

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    setFeatureModal(null)
    setReadingSlug(null)
    setCurrentPost(null)
  }, [])

  // Keyboard left/right arrow navigation
  useEffect(() => {
    const tabOrder: Tab[] = ['features', 'pricing', 'blog', 'contact']
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return
      if (readingSlug) return

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setActiveTab((current) => {
          const idx = tabOrder.indexOf(current)
          if (e.key === 'ArrowRight') {
            return tabOrder[(idx + 1) % tabOrder.length]
          } else {
            return tabOrder[(idx - 1 + tabOrder.length) % tabOrder.length]
          }
        })
        setFeatureModal(null)
        setReadingSlug(null)
        setCurrentPost(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readingSlug])

  // Fetch blog list when blog tab is active
  useEffect(() => {
    if (activeTab !== 'blog') return
    setBlogLoading(true)
    fetch('/api/blog')
      .then((res) => res.json())
      .then((data) => setBlogPosts(data.posts ?? []))
      .catch(() => setBlogPosts([]))
      .finally(() => setBlogLoading(false))
  }, [activeTab])

  // Fetch individual post when reading
  useEffect(() => {
    if (!readingSlug) {
      setCurrentPost(null)
      return
    }
    setPostLoading(true)
    fetch(`/api/blog/${readingSlug}`)
      .then((res) => res.json())
      .then((data) => setCurrentPost(data.post ?? null))
      .catch(() => setCurrentPost(null))
      .finally(() => setPostLoading(false))
  }, [readingSlug])

  // Pricing math
  const extra = Math.max(0, propertyCount - 3)
  const moBase = 25
  const moExtra = extra * 10
  const moTotal = moBase + moExtra
  const yrBase = 240
  const yrExtraEach = 96
  const yrExtraTotal = extra * yrExtraEach
  const yrTotal = yrBase + yrExtraTotal
  const yrMonthly = Math.round(yrTotal / 12)
  const yrSaved = (moTotal * 12) - yrTotal

  const TABS: { key: Tab; label: string }[] = [
    { key: 'features', label: 'Features' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'blog', label: 'Blog' },
    { key: 'contact', label: 'Contact' },
  ]

  return (
    <>
      {/* ── Header ── */}
      <div className="address-header about-header">
        <div className="about-header-inner">
          <div className="address-header-street">About</div>
          <div className="about-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`about-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => switchTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      {activeTab === 'features' && (
        <div key="features" className="about-panel about-features-panel">
          <div className="about-features-grid">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="about-feature-card"
                onClick={() => setFeatureModal(featureModal === i ? null : i)}
              >
                <div className="about-feature-cat">{f.category}</div>
                <div className="about-feature-headline">{f.headline}</div>
                <div className="about-feature-desc">{f.description}</div>
              </div>
            ))}
          </div>

          {featureModal !== null && (
            <div
              className="about-modal-overlay"
              onClick={() => setFeatureModal(null)}
            >
              <div
                className="about-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="about-modal-top">
                  <div className="about-modal-cat">
                    {FEATURES[featureModal].category}
                  </div>
                  <button
                    type="button"
                    className="about-modal-close"
                    onClick={() => setFeatureModal(null)}
                  >
                    ✕
                  </button>
                </div>
                <div className="about-modal-title">
                  {FEATURES[featureModal].example.title}
                </div>
                <div className="about-modal-lines">
                  {FEATURES[featureModal].example.lines.map((line, j) => (
                    <div key={j} className="about-modal-line">
                      <span className="about-modal-dot" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pricing ── */}
      {activeTab === 'pricing' && (
        <div key="pricing" className="about-panel about-pricing-panel">
          <div className="pc-toggle">
            <span className={`pc-tl ${!isAnnual ? 'on' : ''}`}>Monthly</span>
            <button
              type="button"
              className={`pc-track ${isAnnual ? 'on' : ''}`}
              onClick={() => setIsAnnual(!isAnnual)}
            >
              <span className="pc-knob" />
            </button>
            <span className={`pc-tl ${isAnnual ? 'on' : ''}`}>Annual</span>
            {isAnnual && <span className="pc-save-pill">Save 20%</span>}
          </div>

          <p className="pc-free-text">
            Every Chicago address is free to search — unlimited lookups, complete
            complaint, violation, permit, and assessment history.{' '}
            <strong>No account required.</strong>
          </p>

          <div className="pc-cards">
            <div className="pc-card">
              <div className="pc-tier pc-tier-dim">Account</div>
              <div className="pc-price-num">Free</div>
              <div className="pc-sub">with signup</div>
              <div className="pc-features">
                <div>1 saved property</div>
                <div>STR + PBL intelligence</div>
                <div>Weekly email digest</div>
              </div>
            </div>
            <div className="pc-card pc-card-feat">
              <div className="pc-tier pc-tier-navy">Premium</div>
              <div className="pc-price-row">
                <span className="pc-price-num">
                  ${isAnnual ? '20' : '25'}
                </span>
                <span className="pc-price-per">/mo</span>
                {isAnnual && <span className="pc-price-strike">$25</span>}
              </div>
              <div className="pc-sub">
                {isAnnual
                  ? 'Billed annually at $240/yr'
                  : '3 properties included'}
              </div>
              <div className="pc-features">
                <div>3 properties included</div>
                <div>Hourly SMS + email alerts</div>
                <div>+{isAnnual ? '$8' : '$10'}/mo per additional</div>
              </div>
            </div>
          </div>

          <div className="pc-slider-section">
            <div className="pc-slider-header">
              <span className="pc-slider-label">
                How many properties do you manage?
              </span>
              <span className="pc-slider-count">{propertyCount}</span>
            </div>
            <input
              type="range"
              min={3}
              max={10}
              step={1}
              value={propertyCount}
              onChange={(e) => setPropertyCount(parseInt(e.target.value))}
              className="pc-slider-input"
              style={{
                background: `linear-gradient(to right, #0f2744 ${((propertyCount - 3) / 7) * 100}%, #ddd9d0 ${((propertyCount - 3) / 7) * 100}%)`,
              }}
            />
            <div className="pc-slider-ticks">
              {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>

            <div className="pc-breakdown">
              <div className="pc-breakdown-row">
                <span>Premium base (3 properties)</span>
                <span>
                  <span className="pc-breakdown-val">
                    {isAnnual ? '$240/yr' : '$25/mo'}
                  </span>
                  {isAnnual && (
                    <span className="pc-breakdown-strike">$300</span>
                  )}
                </span>
              </div>
              {extra > 0 && (
                <div className="pc-breakdown-row">
                  <span>
                    +{extra} additional × {isAnnual ? '$96/yr' : '$10/mo'}
                  </span>
                  <span>
                    <span className="pc-breakdown-val">
                      {isAnnual ? `$${yrExtraTotal}` : `$${moExtra}`}
                    </span>
                    {isAnnual && (
                      <span className="pc-breakdown-strike">
                        ${extra * 120}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="pc-breakdown-divider" />
              <div className="pc-breakdown-total-row">
                <span className="pc-breakdown-total-label">Total</span>
                <div className="pc-breakdown-total-right">
                  <span className="pc-breakdown-total">
                    {isAnnual ? `$${yrTotal}` : `$${moTotal}`}
                  </span>
                  <span className="pc-breakdown-total-per">
                    {isAnnual ? '/yr' : '/mo'}
                  </span>
                  {isAnnual && (
                    <div className="pc-breakdown-equiv">
                      ${yrMonthly}/mo effective
                    </div>
                  )}
                </div>
              </div>
              {isAnnual && (
                <div className="pc-breakdown-saved">
                  You save ${yrSaved}/yr with annual billing (20% off)
                </div>
              )}
            </div>
          </div>

          <div className="pc-footer-text">
            10+ properties —{' '}
            <button
              type="button"
              className="pc-footer-link"
              onClick={() => switchTab('contact')}
            >
              reach out
            </button>{' '}
            for enterprise pricing
          </div>
        </div>
      )}

      {/* ── Blog List ── */}
      {activeTab === 'blog' && !readingSlug && (
        <div key="blog-list" className="about-panel about-blog-panel">
          {blogLoading ? (
            <div className="about-blog-loading">Loading…</div>
          ) : blogPosts.length === 0 ? (
            <div className="about-blog-loading">No posts yet.</div>
          ) : (
            <div className="about-blog-list">
              {blogPosts.map((post) => (
                <button
                  key={post.slug}
                  type="button"
                  className="about-blog-item"
                  onClick={() => setReadingSlug(post.slug)}
                >
                  <div className="about-blog-title">{post.title}</div>
                  <div className="about-blog-date">{post.date_label}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Blog Post Reader ── */}
      {activeTab === 'blog' && readingSlug && (
        <div key="blog-post" className="about-panel about-post-panel">
          <button
            type="button"
            className="about-post-back"
            onClick={() => setReadingSlug(null)}
          >
            ← All posts
          </button>
          {postLoading || !currentPost ? (
            <div className="about-blog-loading">Loading…</div>
          ) : (
            <div className="about-post-layout">
              <article className="about-post-article">
                <div className="about-post-date">{currentPost.date_label}</div>
                <h1 className="about-post-h1">{currentPost.title}</h1>
                <div className="about-post-body">
                  <ReactMarkdown>{currentPost.body}</ReactMarkdown>
                </div>
              </article>
              <aside className="about-post-sidebar">
                <div className="about-post-sidebar-label">More posts</div>
                {blogPosts
                  .filter((p) => p.slug !== readingSlug)
                  .map((post) => (
                    <div
                      key={post.slug}
                      className="about-post-sidebar-item"
                      onClick={() => setReadingSlug(post.slug)}
                    >
                      <div className="about-post-sidebar-title">
                        {post.title}
                      </div>
                      <div className="about-post-sidebar-date">
                        {post.date_label}
                      </div>
                    </div>
                  ))}
              </aside>
            </div>
          )}
        </div>
      )}

      {/* ── Contact ── */}
      {activeTab === 'contact' && (
        <div key="contact" className="about-panel about-contact-panel">
          <div className="about-contact-row">
            <img
              src="/jim.jpg"
              alt="Jim McMahon"
              className="about-contact-photo"
            />
            <div className="about-contact-info">
              <div className="about-contact-name">Jim McMahon</div>
              <div className="about-contact-credential">
                Founder, City Logical LLC
              </div>
              <p className="about-contact-bio">
                Hello. I&apos;m a solo founder with a background in accounting
                and M&amp;A finance for companies with large real estate
                portfolios. I&apos;m also a transplant to Chicago who fell in
                love with the city&apos;s ingenious design and the people who
                live here. Property Sentinel is my attempt to capitalize on the
                city&apos;s powerful but scattered public data to make buildings
                better, neighborhoods safer, and Chicago smarter.
              </p>
              <p className="about-contact-cta">
                If you want to discuss how Property Sentinel can help your
                organization or our city, please reach out.
              </p>
              <div className="about-contact-channels">
                <a href="mailto:jim@propertysentinel.io">jim@propertysentinel.io</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
