'use client'

import { useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

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

  // (Pricing state moved into PricingCalculator component)

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
          <div className="pricing-monitoring-section">
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

            <div className="pricing-section-header pricing-section-header-centered">
              <h2 className="pricing-section-label">Property Monitoring</h2>
              <p className="pricing-section-sub">
                Real-time SMS and email alerts for every complaint, violation,
                and permit at your buildings. Pricing scales with building size,
                with discounts as buildings get larger.
              </p>
            </div>

            <div className="pc2-formula-band">
              <div className="pc2-formula-title">Pricing formula</div>
              <div className="pc2-formula-grid">
                <div className="pc2-fcell">
                  <div className="pc2-fcell-label">1–6 units</div>
                  <div className="pc2-fcell-amount">$10<small>/mo</small></div>
                </div>
                <div className="pc2-fcell">
                  <div className="pc2-fcell-label">Units 7–100</div>
                  <div className="pc2-fcell-amount">$1.00<small>/ea</small></div>
                </div>
                <div className="pc2-fcell">
                  <div className="pc2-fcell-label">Units 101–200</div>
                  <div className="pc2-fcell-amount">$0.75<small>/ea</small></div>
                </div>
                <div className="pc2-fcell">
                  <div className="pc2-fcell-label">Units 201+</div>
                  <div className="pc2-fcell-amount">$0.50<small>/ea</small></div>
                </div>
              </div>
            </div>

            <div className="pc-cards">
              <div className="pc-card">
                <div className="pc-tier pc-tier-dim">Free account</div>
                <div className="pc-price-num">Free</div>
                <div className="pc-sub">with signup</div>
                <div className="pc-features">
                  <div>Portfolio Dashboard</div>
                  <div>Up to 20 saved properties</div>
                </div>
              </div>
              <div className="pc-card pc-card-feat">
                <div className="pc-tier pc-tier-navy">Premium</div>
                <div className="pc-price-num">$10<small>+/mo</small></div>
                <div className="pc-sub">scales with building size</div>
                <div className="pc-features">
                  <div>Hourly SMS + email alerts</div>
                  <div>311 complaint descriptions</div>
                  <div>Per-unit complaint context</div>
                  <div>City inspection timeline tracking</div>
                  <div>Short-term rental listings</div>
                </div>
              </div>
            </div>

            <PricingCalculator />

            <p className="pricing-enterprise">
              Portfolios above 50 buildings or 5,000 units —{' '}
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

function PricingCalculator() {
  const [units, setUnits] = useState(50)
  const [buildings, setBuildings] = useState(1)

  const calculatePrice = useCallback((u: number): number => {
    if (u <= 6) return 10
    let cost = 10
    if (u <= 100) {
      cost += (u - 6) * 1.0
    } else if (u <= 200) {
      cost += 94 * 1.0 + (u - 100) * 0.75
    } else {
      cost += 94 * 1.0 + 100 * 0.75 + (u - 200) * 0.5
    }
    return cost
  }, [])

  const perBuilding = calculatePrice(units)
  const total = perBuilding * buildings

  const renderBreakdown = () => {
    const rows: ReactNode[] = []

    if (units <= 6) {
      rows.push(
        <div key="base" className="pc2-breakdown-row">
          <span>{units} unit{units === 1 ? '' : 's'} · base rate</span>
          <span>$10.00</span>
        </div>
      )
    } else if (units <= 100) {
      rows.push(
        <div key="base" className="pc2-breakdown-row">
          <span>Base (1–6 units)</span>
          <span>$10.00</span>
        </div>
      )
      rows.push(
        <div key="t1" className="pc2-breakdown-row">
          <span>{units - 6} units × $1.00</span>
          <span>${((units - 6) * 1.0).toFixed(2)}</span>
        </div>
      )
    } else if (units <= 200) {
      rows.push(
        <div key="base" className="pc2-breakdown-row">
          <span>Base (1–6 units)</span>
          <span>$10.00</span>
        </div>
      )
      rows.push(
        <div key="t1" className="pc2-breakdown-row">
          <span>94 units × $1.00</span>
          <span>$94.00</span>
        </div>
      )
      rows.push(
        <div key="t2" className="pc2-breakdown-row">
          <span>{units - 100} units × $0.75</span>
          <span>${((units - 100) * 0.75).toFixed(2)}</span>
        </div>
      )
    } else {
      rows.push(
        <div key="base" className="pc2-breakdown-row">
          <span>Base (1–6 units)</span>
          <span>$10.00</span>
        </div>
      )
      rows.push(
        <div key="t1" className="pc2-breakdown-row">
          <span>94 units × $1.00</span>
          <span>$94.00</span>
        </div>
      )
      rows.push(
        <div key="t2" className="pc2-breakdown-row">
          <span>100 units × $0.75</span>
          <span>$75.00</span>
        </div>
      )
      rows.push(
        <div key="t3" className="pc2-breakdown-row">
          <span>{units - 200} units × $0.50</span>
          <span>${((units - 200) * 0.5).toFixed(2)}</span>
        </div>
      )
    }

    if (buildings > 1) {
      rows.push(<div key="div1" className="pc2-breakdown-divider" />)
      rows.push(
        <div key="per" className="pc2-breakdown-row">
          <span>Per building</span>
          <span>${perBuilding.toFixed(2)}</span>
        </div>
      )
      rows.push(
        <div key="mult" className="pc2-breakdown-row">
          <span>× {buildings} buildings</span>
          <span></span>
        </div>
      )
      rows.push(<div key="div2" className="pc2-breakdown-divider" />)
      rows.push(
        <div key="total" className="pc2-breakdown-total">
          <span>Portfolio total</span>
          <span>
            ${total.toFixed(2)}
            <small>/mo</small>
          </span>
        </div>
      )
    } else {
      rows.push(<div key="div" className="pc2-breakdown-divider" />)
      rows.push(
        <div key="total" className="pc2-breakdown-total">
          <span>Per building</span>
          <span>
            ${perBuilding.toFixed(2)}
            <small>/mo</small>
          </span>
        </div>
      )
    }

    return rows
  }

  const unitsPct = ((units - 1) / (500 - 1)) * 100
  const bldgsPct = ((buildings - 1) / (50 - 1)) * 100

  return (
    <div className="pc2-calc">
      <div className="pc2-calc-header">
        <span className="pc2-calc-title">
          {buildings > 1 ? 'What would my portfolio cost?' : 'What would my building cost?'}
        </span>
        <span className="pc2-calc-result">
          ${total.toFixed(2)}
          <small>/mo</small>
        </span>
      </div>

      <div className="pc2-slider-block">
        <div className="pc2-slider-row">
          <span className="pc2-slider-label">
            {buildings > 1 ? 'Average units per building' : 'Units in building'}
          </span>
          <input
            type="number"
            min={1}
            max={500}
            value={units}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10)
              if (isNaN(raw)) {
                setUnits(1)
              } else {
                setUnits(Math.max(1, Math.min(500, raw)))
              }
            }}
            className="pc2-slider-num-input"
          />
        </div>
        <input
          type="range"
          min={1}
          max={500}
          step={1}
          value={units}
          onChange={(e) => setUnits(parseInt(e.target.value, 10))}
          className="pc2-slider-input"
          style={{
            background: `linear-gradient(to right, #0f2744 ${unitsPct}%, #ddd9d0 ${unitsPct}%)`,
          }}
        />
        <div className="pc2-slider-marks">
          <span style={{ left: '0%' }}>1</span>
          <span style={{ left: '19.84%' }}>100</span>
          <span style={{ left: '39.88%' }}>200</span>
          <span style={{ left: '100%' }}>500</span>
        </div>
      </div>

      <div className="pc2-slider-block">
        <div className="pc2-slider-row">
          <span className="pc2-slider-label">Number of buildings</span>
          <input
            type="number"
            min={1}
            max={50}
            value={buildings}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10)
              if (isNaN(raw)) {
                setBuildings(1)
              } else {
                setBuildings(Math.max(1, Math.min(50, raw)))
              }
            }}
            className="pc2-slider-num-input"
          />
        </div>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={buildings}
          onChange={(e) => setBuildings(parseInt(e.target.value, 10))}
          className="pc2-slider-input"
          style={{
            background: `linear-gradient(to right, #0f2744 ${bldgsPct}%, #ddd9d0 ${bldgsPct}%)`,
          }}
        />
        <div className="pc2-slider-marks">
          <span style={{ left: '0%' }}>1</span>
          <span style={{ left: '18.37%' }}>10</span>
          <span style={{ left: '48.98%' }}>25</span>
          <span style={{ left: '100%' }}>50</span>
        </div>
      </div>

      <div className="pc2-breakdown">{renderBreakdown()}</div>
    </div>
  )
}
