'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useAuth, useClerk } from '@clerk/nextjs'

/* ────────────────────────────────────────────────────────────────────
   COMPLAINT SHOWCASE DATA — real SRs from complaints_311
   ──────────────────────────────────────────────────────────────────── */

type ComplaintRow = { k: string; v: string; a?: 'dept' | 'target' }
type ComplaintStep = {
  s: string
  dot: 'done' | 'current' | 'new' | 'closed'
  t: string
  tc: 'date' | 'current' | 'new'
  dim?: boolean
  a?: boolean
}
type ComplaintTab = {
  key: string
  label: string
  icon: ReactNode
  date: string
  type: string
  sr: string
  heading: string
  chip: { text: string; cls: 'open' | 'closed' }
  addr: string
  desc: string
  nature?: string
  rows: ComplaintRow[]
  steps: ComplaintStep[]
}

const COMPLAINT_TABS: ComplaintTab[] = [
  {
    key: 'nopermit',
    label: 'No Permit',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9.5 12.5l5 5M14.5 12.5l-5 5" />
      </svg>
    ),
    date: 'May 14, 2026 4:21 PM',
    heading: 'No Building Permit & Construction Violation',
    type: 'NO BUILDING PERMIT AND CONSTRUCTION VIOLATION',
    sr: '#SR26-00905168',
    chip: { text: 'OPEN', cls: 'open' },
    addr: '4953 W DRUMMOND PL',
    desc: 'Unpermitted home renovation',
    rows: [
      { k: 'Handled by', v: 'DOB – Buildings', a: 'dept' },
      { k: 'Target Resolution', v: '30 days', a: 'target' },
      { k: 'Avg Resolution', v: '34 days' },
    ],
    steps: [
      { s: 'Complaint Filed', dot: 'done', t: 'MAY 14, 2026', tc: 'date' },
      { s: 'Dispatch Inspector', dot: 'current', t: 'JUNE 11, 2026', tc: 'current', a: true },
      { s: 'Closed', dot: 'new', t: 'NEW', tc: 'new', dim: true },
    ],
  },
  {
    key: 'shvr',
    label: 'Shared Housing',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M10 21v-5h4v5" />
      </svg>
    ),
    date: 'Jul 5, 2026 11:47 PM',
    heading: 'Shared Housing / Vacation Rental',
    type: 'SHARED HOUSING/VACATION RENTAL COMPLAINT',
    sr: '#SR26-01324242',
    chip: { text: 'OPEN', cls: 'open' },
    addr: '5936 S DR MARTIN LUTHER KING JR DR',
    desc: 'Short-term rental — illegal fireworks reported',
    rows: [
      { k: 'Handled by', v: 'BACP', a: 'dept' },
      { k: 'Target Resolution', v: '7 days', a: 'target' },
      { k: 'Avg Resolution', v: '5 days' },
    ],
    steps: [
      { s: 'Complaint Filed', dot: 'done', t: 'JUL 5, 2026', tc: 'date' },
      { s: 'Investigation/Inspection', dot: 'current', t: 'CURRENT', tc: 'current', a: true },
      { s: 'Perform Work', dot: 'new', t: 'NEW', tc: 'new', dim: true },
    ],
  },
  {
    key: 'building',
    label: 'Building',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 21V5l8-3 8 3v16" />
        <path d="M9 9h1M9 13h1M14 9h1M14 13h1M10 21v-4h4v4" />
      </svg>
    ),
    date: 'Jul 6, 2026 9:11 AM',
    heading: 'Building Violation',
    type: 'BUILDING VIOLATION',
    sr: '#SR26-01326147',
    chip: { text: 'OPEN', cls: 'open' },
    addr: '8051 S INGLESIDE AVE',
    desc: 'Mold growth in walls and radiators — unit 2',
    rows: [
      { k: 'Handled by', v: 'DOB – Buildings', a: 'dept' },
      { k: 'Target Resolution', v: '15 days', a: 'target' },
      { k: 'Avg Resolution', v: '18 days' },
    ],
    steps: [
      { s: 'Complaint Filed', dot: 'done', t: 'JUL 6, 2026', tc: 'date' },
      { s: 'Investigation/Inspection', dot: 'current', t: 'CURRENT', tc: 'current', a: true },
      { s: 'Perform Work', dot: 'new', t: 'NEW', tc: 'new', dim: true },
    ],
  },
  {
    key: 'sanitation',
    label: 'Sanitation',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 21h18" />
        <path d="M8 21c0-5-1-8-4-11M8 21c0-4 1.5-6.5 4-8" />
        <path d="M13 21c0-6 1-9.5 4.5-13M13 21c0-4.5 2-7 5.5-8.5" />
      </svg>
    ),
    date: 'Jul 6, 2026 7:22 AM',
    heading: 'Sanitation Code Violation',
    type: 'SANITATION CODE VIOLATION',
    sr: '#SR26-01325263',
    chip: { text: 'OPEN', cls: 'open' },
    addr: '12052 S PERRY AVE',
    desc: 'High grass and weeds in rear yard',
    rows: [
      { k: 'Handled by', v: 'Streets and Sanitation', a: 'dept' },
      { k: 'Target Resolution', v: '3 days', a: 'target' },
      { k: 'Avg Resolution', v: '4 days' },
    ],
    steps: [
      { s: 'Complaint Filed', dot: 'done', t: 'JUL 6, 2026', tc: 'date' },
      { s: 'Investigation/Inspection', dot: 'current', t: 'CURRENT', tc: 'current', a: true },
      { s: 'Perform Work', dot: 'new', t: 'NEW', tc: 'new', dim: true },
    ],
  },
  {
    key: 'dumping',
    label: 'Fly Dumping',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
        <path d="M10 10v6M14 10v6" />
      </svg>
    ),
    date: 'Jul 6, 2026 9:58 AM',
    heading: 'Fly Dumping',
    type: 'FLY DUMPING COMPLAINT',
    sr: '#SR26-01326708',
    chip: { text: 'OPEN', cls: 'open' },
    addr: '5932 S LA SALLE ST',
    desc: 'Illegal dumping in alleyway',
    rows: [
      { k: 'Handled by', v: 'Streets and Sanitation', a: 'dept' },
      { k: 'Target Resolution', v: '7 days', a: 'target' },
      { k: 'Avg Resolution', v: '6 days' },
    ],
    steps: [
      { s: 'Complaint Filed', dot: 'done', t: 'JUL 6, 2026', tc: 'date' },
      { s: 'Investigation/Inspection', dot: 'current', t: 'CURRENT', tc: 'current', a: true },
      { s: 'Perform Work', dot: 'new', t: 'NEW', tc: 'new', dim: true },
    ],
  },
]

const N = COMPLAINT_TABS.length
const LOOP: ComplaintTab[] = [...COMPLAINT_TABS, ...COMPLAINT_TABS, ...COMPLAINT_TABS]
const START = N

const FTS_ANNOTATIONS: { side: 'l' | 'r'; anchor: string; label: string }[] = [
  { side: 'l', anchor: '[data-ftsa="type"]', label: 'Complaint type & SR number' },
  { side: 'r', anchor: '[data-ftsa="chip"]', label: 'Live status, synced every 30 min' },
  { side: 'l', anchor: '[data-ftsa="desc"]', label: "The complaint's context" },
  { side: 'r', anchor: '[data-ftsa="dept"]', label: 'Owning department' },
  { side: 'r', anchor: '[data-ftsa="target"]', label: 'Resolution benchmarks' },
  { side: 'l', anchor: '[data-ftsa="step"]', label: 'Stage-by-stage workflow' },
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

  // (Pricing state moved into PricingCalculator component)

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
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
          <FeaturesShowcase />
        </div>
      )}

      {/* ── Pricing ── */}
      {activeTab === 'pricing' && (
        <div key="pricing" className="about-panel about-pricing-panel">
          <PricingShowcase onSwitchTab={switchTab} />
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

function PricingShowcase({
  onSwitchTab,
}: {
  onSwitchTab: (tab: Tab) => void
}) {
  const [annual, setAnnual] = useState(true)
  const [units, setUnits] = useState(100)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()

  const PORTFOLIO_TIERS = [
    { price: 25, cap: 10, perUnitNum: 2.5 },
    { price: 50, cap: 20, perUnitNum: 2.5 },
    { price: 100, cap: 40, perUnitNum: 2.5 },
    { price: 250, cap: 100, perUnitNum: 2.5 },
    { price: 500, cap: 225, perUnitNum: 2.22 },
    { price: 750, cap: 375, perUnitNum: 2.0 },
    { price: 1000, cap: 550, perUnitNum: 1.82 },
  ]
  const ANNUAL_MULT = 0.8
  const SLIDER_MAX = 600

  const tierForUnits = (u: number): number | null => {
    if (u > 550) return null
    for (let i = 0; i < PORTFOLIO_TIERS.length; i++) {
      if (u <= PORTFOLIO_TIERS[i].cap) return i
    }
    return null
  }

  const tierIdx = tierForUnits(units)
  const isMax = tierIdx === null
  const fillPct = (units / SLIDER_MAX) * 100

  const heroPrice = isMax
    ? null
    : annual
    ? Math.round(PORTFOLIO_TIERS[tierIdx as number].price * ANNUAL_MULT)
    : PORTFOLIO_TIERS[tierIdx as number].price

  const Buildings = ({ n, tone }: { n: 1 | 2 | 3; tone: 'navy' | 'white' }) => {
    const fill = tone === 'white' ? '#ffffff' : '#0f2744'
    const bars: ReactNode[] = []
    if (n >= 1) bars.push(<rect key={0} x={0} y={6} width="7" height="14" rx="1" fill={fill} />)
    if (n >= 2) bars.push(<rect key={1} x={9} y={0} width="7" height="20" rx="1" fill={fill} />)
    if (n >= 3) bars.push(<rect key={2} x={18} y={9} width="7" height="11" rx="1" fill={fill} />)
    const w = n === 1 ? 7 : n === 2 ? 16 : 25
    return (
      <svg width={w} height="20" viewBox={`0 0 ${w} 20`} aria-hidden="true">
        {bars}
      </svg>
    )
  }

  // Portfolio price-block values (only meaningful when !isMax)
  const t = !isMax ? PORTFOLIO_TIERS[tierIdx as number] : null
  const listMo = t ? t.price : 0
  const shownMo = t ? (annual ? Math.round(listMo * ANNUAL_MULT) : listMo) : 0
  const savingYr = t ? listMo * 12 - shownMo * 12 : 0
  const effPerUnit = t ? shownMo / t.cap : 0

  return (
    <div className="pc5">
      <div className="pc5-hero">
        <h1 className="pc5-hero-title">
          One fine costs more than a year of watching
          {heroPrice !== null ? (
            <>
              {' '}at{' '}
              <span className="pc5-hero-price">${heroPrice.toLocaleString()}/mo</span>
            </>
          ) : (
            <>
              {' '}&mdash; <span className="pc5-hero-price">let&apos;s talk</span>
            </>
          )}
        </h1>
        <p className="pc5-hero-sub">
          Cure a complaint before the city even sends an inspector. Simple flat
          pricing.
        </p>
      </div>

      <div className="pc5-controls">
        <div className="pc5-slider-pill">
          <span className="pc5-slider-label">Portfolio size</span>
          <div className="pc5-slider-track-wrap">
            <input
              type="range"
              min={1}
              max={SLIDER_MAX}
              step={1}
              value={units}
              onChange={(e) => setUnits(parseInt(e.target.value, 10))}
              className="pc5-slider"
              aria-label="Portfolio unit count"
              style={{
                background: `linear-gradient(to right, #0f2744 ${fillPct}%, #e6e2d8 ${fillPct}%)`,
              }}
            />
          </div>
          <span className="pc5-slider-count">
            {units >= SLIDER_MAX ? '550+ units' : `${units} units`}
          </span>
        </div>

        <div className="pc5-billing">
          <button
            type="button"
            className={annual ? 'pc5-bill' : 'pc5-bill on'}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button
            type="button"
            className={annual ? 'pc5-bill on' : 'pc5-bill'}
            onClick={() => setAnnual(true)}
          >
            Annual <span className="pc5-bill-pill">&minus;20%</span>
          </button>
        </div>
      </div>

      <div className="pc5-cards">
        {/* BASIC — FREE */}
        <div className="pc5-card">
          <div className="pc5-card-top">
            <Buildings n={1} tone="navy" />
          </div>
          <div className="pc5-tier-name">Basic</div>
          <div className="pc5-price-area">
            <div className="pc5-price-line">
              <span className="pc5-price">Free</span>
            </div>
            <div className="pc5-price-note">Forever. No account required.</div>
          </div>
          <ul className="pc5-feats">
            <li>Search every Cook County address</li>
            <li>Super-parcel &amp; multi-address resolutions</li>
            <li>Full complaint, permit &amp; violation history</li>
          </ul>
          <button
            type="button"
            className="pc5-btn"
            onClick={() => (window.location.href = '/')}
          >
            Search now
          </button>
        </div>

        {/* PORTFOLIO — dark, featured, slider-driven */}
        <div className={'pc5-card pc5-card-dark' + (!isMax ? ' pc5-active' : '')}>
          <div className="pc5-card-top">
            <Buildings n={2} tone="white" />
            <span className="pc5-popular">Most popular</span>
          </div>
          <div className="pc5-tier-name pc5-white">Portfolio</div>
          <div className="pc5-price-area">
            {isMax ? (
              <>
                <div className="pc5-price-line">
                  <span className="pc5-price pc5-white pc5-talk">550+ units</span>
                </div>
                <div className="pc5-price-note pc5-note-white">
                  Beyond the tiers &mdash; see Max &rarr;
                </div>
              </>
            ) : (
              <>
                <div className="pc5-price-line">
                  <span className="pc5-price pc5-white">
                    ${shownMo.toLocaleString()}
                  </span>
                  <span className="pc5-per pc5-per-white">/mo</span>
                  {annual && (
                    <span className="pc5-strike">
                      ${listMo.toLocaleString()}
                    </span>
                  )}
                </div>
                {annual && (
                  <div className="pc5-saving">
                    Saving ${savingYr.toLocaleString()}/yr
                  </div>
                )}
                <div className="pc5-price-note pc5-note-white">
                  up to {t!.cap} units ·{' '}
                  {annual ? (
                    <>
                      <span className="pc5-perunit-strike">
                        ${t!.perUnitNum.toFixed(2)}
                      </span>{' '}
                      ${effPerUnit.toFixed(2)}/unit
                    </>
                  ) : (
                    <>${t!.perUnitNum.toFixed(2)}/unit</>
                  )}
                </div>
              </>
            )}
          </div>
          <ul className="pc5-feats pc5-feats-white">
            <li>Everything in Basic, unlimited properties</li>
            <li>Real-time 311, violation &amp; permit alerts</li>
            <li>Full portfolio dashboard &amp; owner views</li>
            <li>Dashboard customization &amp; full-suite support</li>
          </ul>
          <button
            type="button"
            className="pc5-btn pc5-btn-green"
            onClick={() => {
              if (isMax) {
                setShowEmailModal(true)
              } else if (isSignedIn) {
                window.location.href = '/dashboard'
              } else {
                openSignIn({
                  forceRedirectUrl: '/dashboard',
                  signUpForceRedirectUrl: '/dashboard',
                })
              }
            }}
          >
            {isMax ? 'Talk to Jim' : 'Try for free'}
          </button>
        </div>

        {/* MAX */}
        <div className={'pc5-card pc5-card-muted' + (isMax ? ' pc5-active' : '')}>
          <div className="pc5-card-top">
            <Buildings n={3} tone="navy" />
          </div>
          <div className="pc5-tier-name">Max</div>
          <div className="pc5-price-area">
            <div className="pc5-price-line">
              <span className="pc5-price pc5-talk">Let&apos;s talk</span>
            </div>
            <div className="pc5-price-note">
              550+ units · a flat rate for your whole portfolio
            </div>
          </div>
          <ul className="pc5-feats">
            <li>Everything in Portfolio</li>
            <li>Volume rate below $1.80/unit</li>
            <li>Onboarding &amp; dedicated support</li>
            <li>Data licensing &amp; API access</li>
          </ul>
          <button
            type="button"
            className="pc5-btn pc5-btn-blue"
            onClick={() => setShowEmailModal(true)}
          >
            Email Jim
          </button>
        </div>
      </div>

      <p className="pc5-footnote">
        Every Chicago address is free to search, no account required. Paid plans
        add real-time monitoring and analytics across your portfolio. Flat
        pricing. No per-seat or other hidden fees.
      </p>

      {showEmailModal && (
        <EmailJimModal
          onClose={() => setShowEmailModal(false)}
          defaultUnits={units}
        />
      )}
    </div>
  )
}

function EmailJimModal({
  onClose,
  defaultUnits,
}: {
  onClose: () => void
  defaultUnits: number
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
  const [unitCount, setUnitCount] = useState(String(defaultUnits))
  const [message, setMessage] = useState(
    "I'm interested in portfolio monitoring services!"
  )
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => setMounted(true), [])

  const canSend = name.trim() !== '' && email.trim() !== ''

  const handleSend = async () => {
    if (!canSend) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, org, units: unitCount, message }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(data.error || `Request failed (${res.status})`)
        setStatus('error')
        console.error('Contact send failed:', res.status, data)
        return
      }
      setStatus('sent')
    } catch (err) {
      console.error('Contact send threw:', err)
      setErrorMsg('Network error — please try again.')
      setStatus('error')
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="pcm-overlay" onClick={onClose}>
      <div
        className="pcm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Contact Jim"
      >
        <div className="pcm-head">
          <div className="pcm-title">Email Jim</div>
          <button
            type="button"
            className="pcm-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {status === 'sent' ? (
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <div
              aria-hidden="true"
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: '#e8f5e9',
                color: '#166534',
                fontSize: 24,
                lineHeight: '48px',
                margin: '0 auto 16px',
              }}
            >
              ✓
            </div>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#1a1a1a',
                margin: '0 0 8px',
              }}
            >
              Email sent
            </h3>
            <p style={{ fontSize: 14, color: '#4a5568', margin: '0 0 24px' }}>
              Thanks — we&apos;ll get back to you ASAP.
            </p>
            <button type="button" className="pcm-send" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <p className="pcm-lede">
              Tell me about your portfolio and I&apos;ll be in touch personally.
            </p>

            <div className="pcm-field">
              <label className="pcm-label">Name</label>
              <input
                className="pcm-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="pcm-field">
              <label className="pcm-label">Email</label>
              <input
                className="pcm-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <div className="pcm-field">
              <label className="pcm-label">Organization</label>
              <input
                className="pcm-input"
                type="text"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="Company or portfolio name"
              />
            </div>

            <div className="pcm-field">
              <label className="pcm-label">Number of units</label>
              <input
                className="pcm-input"
                type="number"
                min={1}
                value={unitCount}
                onChange={(e) => setUnitCount(e.target.value)}
                placeholder="e.g. 600"
              />
            </div>

            <div className="pcm-field">
              <label className="pcm-label">Message</label>
              <textarea
                className="pcm-input pcm-textarea"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {status === 'error' && errorMsg ? (
              <p
                style={{
                  color: '#c0392b',
                  fontSize: 13,
                  margin: '0 0 12px',
                  lineHeight: 1.45,
                }}
              >
                {errorMsg}
              </p>
            ) : null}

            <button
              type="button"
              className={
                canSend && status !== 'sending'
                  ? 'pcm-send'
                  : 'pcm-send pcm-send-off'
              }
              disabled={!canSend || status === 'sending'}
              onClick={handleSend}
            >
              {status === 'sending' ? 'Sending…' : 'Send email'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export function FeaturesShowcase({
  autoplayMs = 5000,
  idleResumeMs = 6000,
}: { autoplayMs?: number; idleResumeMs?: number }) {
  const [pos, setPos] = useState(START)
  const [fading, setFading] = useState(false)
  const [paused, setPaused] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const posRef = useRef(START)
  const swapTimer = useRef<number | undefined>(undefined)
  const resumeTimer = useRef<number | undefined>(undefined)
  const drag = useRef({ down: false, moved: false, captured: false, startX: 0, startScroll: 0, pid: 0 })

  const logical = ((pos % N) + N) % N
  const d = COMPLAINT_TABS[logical]

  const positionAnnotations = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    if (typeof window !== 'undefined' && window.innerWidth <= 1060) return
    const stageTop = stage.getBoundingClientRect().top
    stage.querySelectorAll<HTMLElement>('.fts-ann').forEach((ann) => {
      const sel = ann.dataset.anchor
      const anchor = sel ? stage.querySelector<HTMLElement>(sel) : null
      if (!anchor) {
        ann.style.display = 'none'
        return
      }
      ann.style.display = 'flex'
      const r = anchor.getBoundingClientRect()
      ann.style.top = `${r.top + r.height / 2 - stageTop - ann.offsetHeight / 2}px`
    })
  }, [])

  useEffect(() => {
    positionAnnotations()
    window.addEventListener('resize', positionAnnotations)
    const fonts = (document as { fonts?: { ready?: Promise<unknown> } }).fonts
    if (fonts?.ready) {
      fonts.ready.then(() => positionAnnotations()).catch(() => {})
    }
    return () => window.removeEventListener('resize', positionAnnotations)
  }, [positionAnnotations])

  const centerTo = useCallback((absIndex: number, smooth: boolean) => {
    const track = trackRef.current
    if (!track || typeof track.scrollTo !== 'function') return
    const items = track.querySelectorAll<HTMLElement>('.fts-tab')
    const el = items[absIndex]
    if (!el) return
    const target = el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2
    track.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  useEffect(() => {
    centerTo(posRef.current, false)
    const onResize = () => centerTo(posRef.current, false)
    window.addEventListener('resize', onResize)
    const fonts = (document as { fonts?: { ready?: Promise<unknown> } }).fonts
    if (fonts?.ready) {
      fonts.ready.then(() => centerTo(posRef.current, false)).catch(() => {})
    }
    return () => window.removeEventListener('resize', onResize)
  }, [centerTo])

  useEffect(() => {
    if (!fading) positionAnnotations()
  }, [pos, fading, positionAnnotations])

  const goTo = useCallback(
    (absIndex: number) => {
      if (swapTimer.current) window.clearTimeout(swapTimer.current)
      setFading(true)
      centerTo(absIndex, true)
      swapTimer.current = window.setTimeout(() => {
        posRef.current = absIndex
        setPos(absIndex)
        setFading(false)
      }, 180)
    },
    [centerTo],
  )

  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => {
      let p = posRef.current
      if (p < N || p >= 2 * N) {
        const norm = N + (((p % N) + N) % N)
        posRef.current = norm
        setPos(norm)
        centerTo(norm, false)
        p = norm
      }
      goTo(p + 1)
    }, autoplayMs)
    return () => window.clearInterval(id)
  }, [paused, autoplayMs, centerTo, goTo])

  const registerInteraction = useCallback(() => {
    setPaused(true)
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => setPaused(false), idleResumeMs)
  }, [idleResumeMs])

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current)
      if (swapTimer.current) window.clearTimeout(swapTimer.current)
    },
    [],
  )

  const selectAbs = (absIndex: number) => {
    registerInteraction()
    if (absIndex === posRef.current || fading) {
      centerTo(absIndex, true)
      return
    }
    goTo(absIndex)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') {
      registerInteraction()
      return
    }
    const track = trackRef.current
    if (!track) return
    drag.current = {
      down: true,
      moved: false,
      captured: false,
      startX: e.clientX,
      startScroll: track.scrollLeft,
      pid: e.pointerId,
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = drag.current
    if (!st.down) return
    const dx = e.clientX - st.startX
    if (!st.moved && Math.abs(dx) > 4) {
      st.moved = true
      const track = trackRef.current
      if (track) {
        try {
          track.setPointerCapture(st.pid)
          st.captured = true
        } catch {
          /* noop */
        }
      }
      registerInteraction()
    }
    if (st.moved) {
      const track = trackRef.current
      if (track) track.scrollLeft = st.startScroll - dx
    }
  }
  const nearestAbsToCenter = () => {
    const track = trackRef.current
    if (!track) return posRef.current
    const items = track.querySelectorAll<HTMLElement>('.fts-tab')
    const mid = track.scrollLeft + track.clientWidth / 2
    let best = posRef.current
    let bestD = Infinity
    items.forEach((el, idx) => {
      const c = el.offsetLeft + el.offsetWidth / 2
      const dd = Math.abs(c - mid)
      if (dd < bestD) {
        bestD = dd
        best = idx
      }
    })
    return best
  }
  const onPointerUp = () => {
    const st = drag.current
    const wasDrag = st.moved
    if (st.captured) {
      const track = trackRef.current
      try {
        track?.releasePointerCapture(st.pid)
      } catch {
        /* noop */
      }
    }
    st.down = false
    st.captured = false
    if (wasDrag) goTo(nearestAbsToCenter())
  }
  const onPointerLeave = () => {
    drag.current.down = false
  }

  return (
    <div className="fts">
      <div className="fts-head">
        <h2 className="fts-title">
          See every complaint
          <br />
          <span className="pc5-hero-price">before the city acts</span>
        </h2>
        <p className="fts-sub">
          Right now, you only find out about a 311 complaint after an inspector
          shows up. Property Sentinel serves you the complaint&apos;s{' '}
          <strong>actual context</strong>, relevant department, and workflow
          timeline — refreshed every 30 minutes.
        </p>
      </div>

      <div className="fts-stage" ref={stageRef}>
        {FTS_ANNOTATIONS.map((a) => (
          <div
            key={a.label}
            className={a.side === 'l' ? 'fts-ann fts-ann--l' : 'fts-ann fts-ann--r'}
            data-anchor={a.anchor}
            aria-hidden="true"
          >
            {a.side === 'l' ? (
              <>
                <span>{a.label}</span>
                <i className="fts-ann-line" />
              </>
            ) : (
              <>
                <i className="fts-ann-line" />
                <span>{a.label}</span>
              </>
            )}
          </div>
        ))}

        <div className="fts-card-col">
          <div className="fts-modal">
            <span
              className={
                d.chip.cls === 'open'
                  ? 'fts-m-status fts-chip fts-chip--open'
                  : 'fts-m-status fts-chip fts-chip--closed'
              }
              data-ftsa="chip"
            >
              {d.chip.text}
            </span>
            <div className={fading ? 'fts-fade out' : 'fts-fade'}>
              <div className="fts-m-title" data-ftsa="type">
                {d.heading}
              </div>
              <div className="fts-m-meta">
                <b>{d.sr}</b> <span>· {d.date}</span>
              </div>
              <hr className="fts-hr" />
              <div className="fts-m-toprow">
                <div className="fts-m-addr">
                  <span className="lbl">Address:</span>{' '}
                  <a href="#" onClick={(e) => e.preventDefault()}>
                    {d.addr}
                  </a>
                </div>
              </div>
              <div className="fts-m-desc" data-ftsa="desc">
                {d.desc}
              </div>
              {d.nature && (
                <div className="fts-m-nature">
                  <span className="lbl">Nature of violation:</span> <b>{d.nature}</b>
                </div>
              )}
              <div className="fts-m-rows">
                {d.rows.map((r) => (
                  <div
                    key={r.k}
                    className="fts-m-row"
                    {...(r.a ? { 'data-ftsa': r.a } : {})}
                  >
                    <span className="k">{r.k}</span>
                    <span className="v">{r.v}</span>
                  </div>
                ))}
              </div>
              <div className="fts-m-workflow">
                <hr className="fts-hr" />
                <div className="fts-m-worklbl">WORKFLOW</div>
                <div>
                  {d.steps.map((st) => (
                    <div
                      key={st.s}
                      className={st.dim ? 'fts-step dim' : 'fts-step'}
                      {...(st.a ? { 'data-ftsa': 'step' } : {})}
                    >
                      <span className={`fts-dot fts-dot--${st.dot}`} />
                      <span className="s">{st.s}</span>
                      <span className={`t t--${st.tc}`}>{st.t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="fts-tabs">
            <div
              className="fts-tabtrack"
              ref={trackRef}
              role="tablist"
              aria-label="Complaint types"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
              onTouchStart={registerInteraction}
            >
              {LOOP.map((t, j) => {
                const isNext = j === pos + 1
                const cls =
                  (j === pos ? 'fts-tab on' : 'fts-tab') +
                  (isNext ? (paused ? ' queuing queuing-paused' : ' queuing') : '')
                return (
                  <button
                    key={`${t.key}-${j}`}
                    type="button"
                    role="tab"
                    aria-selected={j === pos}
                    aria-hidden={j % N === logical && j !== pos ? true : undefined}
                    tabIndex={j >= START && j < START + N ? 0 : -1}
                    className={cls}
                    style={
                      isNext ? ({ ['--fill-ms']: `${autoplayMs}ms` } as React.CSSProperties) : undefined
                    }
                    onClick={() => {
                      if (drag.current.moved) return
                      selectAbs(j)
                    }}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="fts-grid">
        <div className="fts-feat">
          <div className="ico">
            <svg viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3>Complaint context</h3>
          <p>
            The reason the complaint was actually made — not just the one-line
            category code in the public dataset.
          </p>
        </div>
        <div className="fts-feat">
          <div className="ico">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          </div>
          <h3>Resolution benchmarks</h3>
          <p>
            Target resolution time from the city and average resolution time calculated by us based on our hourly refreshed data.
          </p>
        </div>
        <div className="fts-feat">
          <div className="ico">
            <svg viewBox="0 0 24 24">
              <path d="M4 12h4l2-7 4 14 2-7h4" />
            </svg>
          </div>
          <h3>Workflow tracking</h3>
          <p>
            Watch a complaint move from filed to inspection to resolution —
            stage by stage, as the city updates it.
          </p>
        </div>
        <div className="fts-feat">
          <div className="ico">
            <svg viewBox="0 0 24 24">
              <path d="M22 6 12 13 2 6" />
              <rect x="2" y="4" width="20" height="16" rx="2" />
            </svg>
          </div>
          <h3>Real-time alerts</h3>
          <p>
            In your inbox within one refresh cycle of the city logging it —
            instant or as a daily digest.
          </p>
        </div>
        <div className="fts-feat">
          <div className="ico">
            <svg viewBox="0 0 24 24">
              <path d="M3 21h18M5 21V7l7-4 7 4v14" />
              <path d="M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" />
            </svg>
          </div>
          <h3>Full parcel history</h3>
          <p>
            All complaints, violations, and permits on digital record — tied to the
            parcel and owner of record.
          </p>
        </div>
        <div className="fts-feat">
          <div className="ico">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
          </div>
          <h3>Portfolio dashboard</h3>
          <p>
            Every address you manage on one screen, ranked by what needs your
            attention right now.
          </p>
        </div>
      </div>

      <div className="fts-rest">
        <h2>The rest of the picture</h2>
        <div className="fts-rest-row">
          <h3>Only what&apos;s owner-relevant</h3>
          <p>
            Chicago&apos;s 311 system has <b>more than 110 complaint types</b>.
            Only <b>29</b> ever land on a building owner as something to act on
            — those are on by default, and the rest never reach your inbox.
          </p>
        </div>
        <div className="fts-rest-row">
          <h3>Every department, tracked</h3>
          <p suppressHydrationWarning>
            The owning department decides the clock, the cost, and whether the
            fine is real. We tag it on every complaint &mdash; <b>Buildings, Streets &amp; Sanitation, Water Management, BACP, Public Health</b>, and beyond.
          </p>
        </div>
        <div className="fts-rest-row">
          <h3>Violations and permits, too</h3>
          <p suppressHydrationWarning>
            Complaints are the early warning. We also track <b>DOB violations and permit filings </b> at the address level &mdash;  with real current status, not the city&rsquo;s inspection-history maze.
          </p>
        </div>
      </div>
    </div>
  )
}
