'use client'

import { useState, useCallback } from 'react'

/* ────────────────────────────────────────────────────────────────────
   DATA
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
    headline: 'Know the moment it\u2019s filed',
    description:
      'Every complaint ingested within 30 minutes. Heating, rodents, building violations, shared housing \u2014 13M records, searchable by address.',
    example: {
      title: '5540 S Hyde Park Blvd',
      lines: [
        'Building Violation \u2014 Mar 4, 2026 \u00b7 Open',
        'Heating Complaint \u2014 Jan 12, 2026 \u00b7 Completed',
        'Rodent Baiting \u2014 Nov 8, 2025 \u00b7 Completed',
        '134 total complaints on record',
      ],
    },
  },
  {
    category: 'Building resolution',
    headline: 'One building, one record',
    description:
      'Multiple addresses, multiple PINs \u2014 resolved automatically into a single unified property view.',
    example: {
      title: '1112\u20131134 N La Salle & 153\u2013163 W Elm',
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
        'Failed porch \u2014 wood deteriorated beyond repair',
        'Handrails missing, rear staircase 2nd\u20133rd floor',
        'Stop work order issued \u2014 permit #100924618',
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
      title: '70 E Cedar St \u00b7 Prohibited Building',
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
        'Class 299 \u2014 Condo, 10% assessment level',
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
      title: 'Weekly digest \u2014 344 W Concord Pl',
      lines: [
        '2 new 311 complaints filed this week',
        '1 permit status changed to ISSUED',
        'No new violations',
        'Upgrade to Premium for hourly SMS alerts',
      ],
    },
  },
]

type BlogPost = {
  slug: string
  title: string
  date: string
  hasContent: boolean
}

const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'shvr-complaint-lifecycle',
    title: 'What happens after an SHVR complaint is filed in Chicago',
    date: 'March 2026',
    hasContent: true,
  },
  {
    slug: '311-complaint-types',
    title: 'Chicago 311 complaint types: what each code means for your property',
    date: 'March 2026',
    hasContent: false,
  },
  {
    slug: '201-str-operators',
    title: '201 licensed STR operators in Chicago: what the data shows',
    date: 'April 2026',
    hasContent: false,
  },
  {
    slug: 'building-12-addresses',
    title: 'Why one Chicago building has 12 different addresses',
    date: 'April 2026',
    hasContent: false,
  },
  {
    slug: 'permits-inspections-violations',
    title: 'Permits, inspections, and violations: how they\u2019re connected',
    date: 'April 2026',
    hasContent: false,
  },
  {
    slug: 'assessed-values-2023-vs-2025',
    title: 'Cook County assessed values: why the county shows 2023 and we show 2025',
    date: 'May 2026',
    hasContent: false,
  },
]

/* ────────────────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────────────────── */

type Tab = 'features' | 'pricing' | 'blog' | 'contact'

export default function AboutClient() {
  const [activeTab, setActiveTab] = useState<Tab>('features')
  const [featureModal, setFeatureModal] = useState<number | null>(null)
  const [readingPost, setReadingPost] = useState<string | null>(null)

  // Pricing state
  const [isAnnual, setIsAnnual] = useState(false)
  const [propertyCount, setPropertyCount] = useState(3)

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    setFeatureModal(null)
    setReadingPost(null)
  }, [])

  const extra = Math.max(0, propertyCount - 3)

  // Monthly math
  const moBase = 25
  const moExtra = extra * 10
  const moTotal = moBase + moExtra

  // Annual math (20% discount across the board)
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
        <div className="about-panel about-features-panel">
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

          {/* Centered modal overlay */}
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
        <div className="about-panel about-pricing-panel">
          {/* Toggle */}
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

          {/* Free text */}
          <p className="pc-free-text">
            Every Chicago address is free to search — unlimited lookups, complete
            complaint, violation, permit, and assessment history.{' '}
            <strong>No account required.</strong>
          </p>

          {/* Two cards */}
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
                {isAnnual && (
                  <span className="pc-price-strike">$25</span>
                )}
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

          {/* Slider */}
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
                      {isAnnual
                        ? `$${yrExtraTotal}`
                        : `$${moExtra}`}
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

      {/* ── Blog ── */}
      {activeTab === 'blog' && !readingPost && (
        <div className="about-panel about-blog-panel">
          <div className="about-blog-list">
            {BLOG_POSTS.map((post) => (
              <button
                key={post.slug}
                type="button"
                className="about-blog-item"
                onClick={() => post.hasContent && setReadingPost(post.slug)}
                style={{ cursor: post.hasContent ? 'pointer' : 'default' }}
              >
                <div className="about-blog-title">{post.title}</div>
                <div className="about-blog-date">
                  {post.date}
                  {!post.hasContent && (
                    <span className="about-blog-soon"> · Coming soon</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Blog Post Reader ── */}
      {activeTab === 'blog' && readingPost === 'shvr-complaint-lifecycle' && (
        <div className="about-panel about-post-panel">
          <button
            type="button"
            className="about-post-back"
            onClick={() => setReadingPost(null)}
          >
            ← All posts
          </button>
          <div className="about-post-layout">
            <article className="about-post-article">
              <div className="about-post-date">March 2026</div>
              <h1 className="about-post-h1">
                What happens after an SHVR complaint is filed in Chicago
              </h1>
              <div className="about-post-body">
                <p>
                  When someone files a Shared Housing Vacation Rental complaint
                  through Chicago&apos;s 311 system, it enters a queue at the
                  Department of Business Affairs and Consumer Protection. The
                  complaint is assigned an SR number and classified under the
                  short code SHVR. From that moment, the clock starts — but
                  nobody tells the operator.
                </p>
                <p>
                  We analyzed every SHVR complaint filed in Chicago since 2018.
                  The median time from filing to resolution is 23 days. But that
                  median hides enormous variance: complaints in the Loop close
                  in 8–12 days; complaints in outlying wards can sit open for 90
                  or more.
                </p>
                <p>
                  The enforcement pattern is clear. BACP inspectors prioritize
                  by geography and complaint density, not chronological order. A
                  building with two SHVR complaints in a 30-day window moves to
                  the front of the queue. A building with one complaint and no
                  prior history waits.
                </p>
                <p>
                  What makes this data actionable is the gap between filing and
                  inspection. For most complaints, that window is 6 to 21 days —
                  long enough to pull registrations, verify compliance, and
                  address the issue before an inspector arrives. The operators
                  who know the complaint was filed have time to respond. The
                  operators who don&apos;t find out when someone knocks on the door.
                </p>
                <p>
                  Property Sentinel ingests SHVR complaints within 30 minutes of
                  filing. If your address is monitored, you&apos;ll know before the
                  inspector is dispatched.
                </p>
                <p className="about-post-note">
                  This analysis is based on 13.4 million 311 records in the
                  Property Sentinel database, filtered to the SHVR complaint
                  type. All data is sourced from the City of Chicago Data
                  Portal.
                </p>
              </div>
            </article>
            <aside className="about-post-sidebar">
              <div className="about-post-sidebar-label">More posts</div>
              {BLOG_POSTS.filter((p) => p.slug !== readingPost).map((post) => (
                <div
                  key={post.slug}
                  className="about-post-sidebar-item"
                  onClick={() =>
                    post.hasContent && setReadingPost(post.slug)
                  }
                  style={{
                    cursor: post.hasContent ? 'pointer' : 'default',
                  }}
                >
                  <div className="about-post-sidebar-title">{post.title}</div>
                  <div className="about-post-sidebar-date">{post.date}</div>
                </div>
              ))}
            </aside>
          </div>
        </div>
      )}

      {/* ── Contact ── */}
      {activeTab === 'contact' && (
        <div className="about-panel about-contact-panel">
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
                jim@propertysentinel.io
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}