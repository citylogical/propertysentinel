'use client'

import { useState, useCallback, useEffect } from 'react'

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

type Tab = 'features' | 'pricing' | 'contact'

/* ────────────────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────────────────── */

export default function AboutClient() {
  const [activeTab, setActiveTab] = useState<Tab>('features')
  const [featureModal, setFeatureModal] = useState<number | null>(null)

  // Pricing state
  const [isAnnual, setIsAnnual] = useState(false)
  const [propertyCount, setPropertyCount] = useState(3)

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    setFeatureModal(null)
  }, [])

  // Keyboard left/right arrow navigation
  useEffect(() => {
    const tabOrder: Tab[] = ['features', 'pricing', 'contact']
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return

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
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const sliderMin = 3
  const sliderMax = 20
  const sliderRange = sliderMax - sliderMin

  // Pricing math
  const extra = Math.max(0, propertyCount - sliderMin)
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
    { key: 'contact', label: 'Contact' },
  ]

  return (
    <>
      {/* ── Header ── */}
      <div className="property-identity-row">
        <div className="property-identity-left">
          <h1 className="property-identity-address">About</h1>
          <div className="property-identity-citystate">
            for Chicago property owners, operators, tradesmen, and residents
          </div>
        </div>
      </div>

      <div className="about-tabs-row">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={
              activeTab === t.key ? 'about-tab about-tab-active' : 'about-tab'
            }
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
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
          <div className="page-intro-callout">
            <p className="pricing-intro">
              Every Chicago address is free to search — unlimited lookups,
              complete complaint, violation, permit, and assessment history.{' '}
              <strong>No account required.</strong> If you&apos;re a researcher
              or journalist,{' '}
              <a
                href="#contact"
                onClick={(e) => {
                  e.preventDefault()
                  switchTab('contact')
                }}
              >
                reach out
              </a>{' '}
              for a premium account.
            </p>
          </div>

          <div className="pricing-two-col">
            <div className="pricing-column pricing-column-monitoring">
              <div className="pricing-section-header">
                <h2 className="pricing-section-label">Property Monitoring</h2>
                <p className="pricing-section-sub">
                  Real-time SMS and email alerts for every complaint,
                  violation, and permit at your properties.
                </p>
              </div>

              <div className="pc-toggle">
                <span className={`pc-tl ${!isAnnual ? 'on' : ''}`}>
                  Monthly
                </span>
                <button
                  type="button"
                  className={`pc-track ${isAnnual ? 'on' : ''}`}
                  onClick={() => setIsAnnual(!isAnnual)}
                >
                  <span className="pc-knob" />
                </button>
                <span className={`pc-tl ${isAnnual ? 'on' : ''}`}>
                  Annual
                </span>
                {isAnnual && <span className="pc-save-pill">Save 20%</span>}
              </div>

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
                    <div>
                      +{isAnnual ? '$8' : '$10'}/mo per additional
                    </div>
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
                  min={sliderMin}
                  max={sliderMax}
                  step={1}
                  value={propertyCount}
                  onChange={(e) =>
                    setPropertyCount(parseInt(e.target.value, 10))
                  }
                  className="pc-slider-input"
                  style={{
                    background: `linear-gradient(to right, #0f2744 ${((propertyCount - sliderMin) / sliderRange) * 100}%, #ddd9d0 ${((propertyCount - sliderMin) / sliderRange) * 100}%)`,
                  }}
                />
                <div className="pricing-slider-ticks">
                  <span className="pricing-slider-tick" style={{ left: '0%' }}>
                    3
                  </span>
                  <span
                    className="pricing-slider-tick"
                    style={{ left: '11.76%' }}
                  >
                    5
                  </span>
                  <span
                    className="pricing-slider-tick"
                    style={{ left: '41.18%' }}
                  >
                    10
                  </span>
                  <span
                    className="pricing-slider-tick"
                    style={{ left: '70.59%' }}
                  >
                    15
                  </span>
                  <span
                    className="pricing-slider-tick"
                    style={{ left: '100%' }}
                  >
                    20
                  </span>
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
                        +{extra} additional ×{' '}
                        {isAnnual ? '$96/yr' : '$10/mo'}
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

              <p className="pricing-enterprise">
                20+ properties —{' '}
                <a
                  href="#contact"
                  className="pc-footer-link"
                  onClick={(e) => {
                    e.preventDefault()
                    switchTab('contact')
                  }}
                >
                  reach out
                </a>{' '}
                for enterprise pricing
              </p>
            </div>

            <div className="pricing-column-divider" aria-hidden="true" />

            <div className="pricing-column pricing-column-unlocks">
              <div className="pricing-section-header">
                <h2 className="pricing-section-label">Owner Unlocks</h2>
                <p className="pricing-section-sub">
                  Reveal owner names, mailing addresses, and phone numbers for
                  any property. Bad data is automatically credited back.
                </p>
              </div>

              <div className="pricing-payg-card">
                <div className="pricing-payg-left">
                  <div className="pricing-sublabel">Pay as you go</div>
                  <div className="pricing-payg-price">
                    <span className="pricing-payg-amount">$10</span>
                    <span className="pricing-payg-unit">per unlock</span>
                  </div>
                  <p className="pricing-payg-meta">5 free unlocks at signup</p>
                </div>
                <div className="pricing-payg-right">
                  Card on file, charged per reveal.
                  <br />
                  Wrong number? Auto-credited.
                </div>
              </div>

              <div className="pricing-sublabel pricing-credit-packs-header">
                Credit packs
                <span className="pricing-credit-packs-sub">
                  {' · '}Save up to 25% — never expire
                </span>
              </div>

              <div className="pricing-credit-packs">
                <div className="pricing-credit-pack">
                  <div className="pricing-credit-pack-tier">Starter</div>
                  <div className="pricing-credit-pack-price">$85</div>
                  <div className="pricing-credit-pack-units">10 unlocks</div>
                  <div className="pricing-credit-pack-each">
                    $8.50 each · 15% off
                  </div>
                </div>
                <div className="pricing-credit-pack">
                  <div className="pricing-credit-pack-tier">Pro</div>
                  <div className="pricing-credit-pack-price">$200</div>
                  <div className="pricing-credit-pack-units">25 unlocks</div>
                  <div className="pricing-credit-pack-each">
                    $8.00 each · 20% off
                  </div>
                </div>
                <div className="pricing-credit-pack">
                  <div className="pricing-credit-pack-tier">Volume</div>
                  <div className="pricing-credit-pack-price">$375</div>
                  <div className="pricing-credit-pack-units">50 unlocks</div>
                  <div className="pricing-credit-pack-each">
                    $7.50 each · 25% off
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact ── */}
      {activeTab === 'contact' && (
        <div
          key="contact"
          id="contact"
          className="about-panel about-contact-panel"
        >
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
