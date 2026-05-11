'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import PortfolioSummaryBanner from './PortfolioSummaryBanner'
import PortfolioSummaryModal, { type PortfolioSummaryData } from './PortfolioSummaryModal'

const TABS = [
  { href: '/dashboard/portfolio', label: 'Portfolio' },
  { href: '/dashboard/activity', label: 'Activity Feed' },
]

export default function DashboardLayoutClient({
  children,
  propertyCount: _propertyCount,
  today: _today,
}: {
  children: ReactNode
  propertyCount: number
  today: string
}) {
  const pathname = usePathname()
  const { isSignedIn, isLoaded: clerkLoaded } = useUser()
  const [summaryData, setSummaryData] = useState<PortfolioSummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryOpen, setSummaryOpen] = useState(false)

  // Fetch summary data once Clerk knows whether the user is signed in.
  // Re-fires on sign-in transition so the modal can open after auth
  // flow completes without a hard refresh.
  useEffect(() => {
    if (!clerkLoaded) return
    if (!isSignedIn) {
      setSummaryData(null)
      setSummaryLoading(false)
      return
    }
    let cancelled = false
    setSummaryLoading(true)
    fetch('/api/dashboard/portfolio-summary')
      .then((r) => r.json())
      .then((data: PortfolioSummaryData & { error?: string }) => {
        if (cancelled) return
        if (!data.error) setSummaryData(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [clerkLoaded, isSignedIn])

  // Decide whether to auto-open the modal once summary data loads.
  // Three guards:
  //  1) Don't open if the API didn't return data (likely unauthenticated or error)
  //  2) Don't open if the portfolio is empty (nothing to show)
  //  3) Respect localStorage suppression + sessionStorage "already seen" flags
  //  Force-open via ?show_summary=1 bypasses all guards EXCEPT requiring data.
  useEffect(() => {
    if (summaryLoading) return
    if (!summaryData) return
    if ((summaryData.headline?.total_buildings ?? 0) === 0) return

    const suppressed =
      typeof window !== 'undefined' && window.localStorage.getItem('ps_summary_suppressed') === 'true'
    const seenThisSession =
      typeof window !== 'undefined' && window.sessionStorage.getItem('ps_summary_seen') === 'true'
    const forceShow =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('show_summary') === '1'

    if (forceShow || (!suppressed && !seenThisSession)) {
      setSummaryOpen(true)
      if (typeof window !== 'undefined') window.sessionStorage.setItem('ps_summary_seen', 'true')
    }
  }, [summaryLoading, summaryData])

  return (
    <div className="prop-main-content">
      <header
        style={{
          borderBottom: '1px solid #e5e1d6',
          background: 'var(--bg)',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div className="dashboard-identity-row" style={{ borderBottom: 'none' }}>
          <div className="dashboard-identity-left">
            <div className="dashboard-logo">PS</div>
            <div className="dashboard-identity-text">
              <h1>{summaryData?.organization ? `${summaryData.organization} Dashboard` : 'Dashboard'}</h1>
              <div className="dashboard-identity-sub">
                Last 12 months ·{' '}
                {new Date().toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, marginBottom: 14, paddingLeft: 28, paddingRight: 28 }}>
          <PortfolioSummaryBanner
            data={summaryData}
            loading={summaryLoading}
            onOpenSummary={() => setSummaryOpen(true)}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            padding: '0 32px',
          }}
        >
          {TABS.map((tab) => {
            const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  padding: '14px 0',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 14,
                  fontWeight: 500,
                  color: isActive ? '#0f2744' : '#6b7280',
                  borderBottom: isActive ? '2px solid #0f2744' : '2px solid transparent',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {tab.label}
              </Link>
            )
          })}
          <button
            type="button"
            className="dashboard-banner-add-btn"
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
            }}
          >
            + Add property
          </button>
        </div>
      </header>

      {children}
      <PortfolioSummaryModal
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        showSuppressionOption
        onSuppressChange={(s) => {
          if (typeof window !== 'undefined') {
            if (s) window.localStorage.setItem('ps_summary_suppressed', 'true')
            else window.localStorage.removeItem('ps_summary_suppressed')
          }
        }}
        data={summaryData}
        loading={summaryLoading}
      />
    </div>
  )
}
