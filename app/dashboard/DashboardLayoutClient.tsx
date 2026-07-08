'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import type { Entitlement } from '@/lib/entitlement'
import StagedQueueModal from '@/components/StagedQueueModal'
import AddPropertyModal from './AddPropertyModal'

type HeaderStats = {
  buildings: number
  units: number
  organization: string | null
  is_admin: boolean
  entitlement: Entitlement | null
}

// Tabs assembled per-render so the Dashboard tab can be conditionally
// included for admins only. Dashboard leads when present so it reads as
// the default landing tab — the root /dashboard redirect in
// app/dashboard/page.tsx sends admins to /dashboard/insights.
function buildTabs(isAdmin: boolean) {
  const tabs: Array<{ href: string; label: string }> = []
  if (isAdmin) {
    tabs.push({ href: '/dashboard/insights', label: 'Dashboard' })
  }
  tabs.push({ href: '/dashboard/portfolio', label: 'Portfolio' })
  tabs.push({ href: '/dashboard/activity', label: 'Activity Feed' })
  tabs.push({ href: '/dashboard/settings', label: 'Settings' })
  return tabs
}

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
  const [stats, setStats] = useState<HeaderStats | null>(null)
  const [addPropOpen, setAddPropOpen] = useState(false)
  const [stagedCount, setStagedCount] = useState(0)
  const [queueOpen, setQueueOpen] = useState(false)

  useEffect(() => {
    const handler = () => setAddPropOpen(true)
    window.addEventListener('ps:open-add-property', handler)
    return () => window.removeEventListener('ps:open-add-property', handler)
  }, [])

  useEffect(() => {
    const handler = () => setQueueOpen(true)
    window.addEventListener('ps:open-staged-queue', handler)
    return () => window.removeEventListener('ps:open-staged-queue', handler)
  }, [])

  // Anyone with staged rows gets served the queue modal on arrival —
  // regardless of whether they have saved properties yet. Always dismissible;
  // the "Review added properties" triggers re-open it.
  useEffect(() => {
    if (!clerkLoaded || !isSignedIn) return
    let cancelled = false
    fetch('/api/dashboard/stage')
      .then((r) => r.json())
      .then((data: { staged_count?: number }) => {
        if (cancelled) return
        const count = data.staged_count ?? 0
        setStagedCount(count)
        if (count > 0) setQueueOpen(true)
      })
      .catch(() => {
        // Non-fatal — the user can still reach the queue from an address page.
      })
    return () => {
      cancelled = true
    }
  }, [clerkLoaded, isSignedIn])

  useEffect(() => {
    if (!clerkLoaded) return
    if (!isSignedIn) {
      setStats(null)
      return
    }
    let cancelled = false
    fetch('/api/dashboard/header-stats')
      .then((r) => r.json())
      .then((data: HeaderStats & { error?: string }) => {
        if (cancelled) return
        if (!data.error) setStats(data)
      })
      .catch(() => {
        // Header stats failure is non-fatal — leave the right side blank.
      })
    return () => {
      cancelled = true
    }
  }, [clerkLoaded, isSignedIn])

  const orgPrefix = stats?.organization ? `${stats.organization}` : 'Dashboard'
  const todayStr = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Chrome (identity header + tabs) shows only for a signed-in user who has
  // at least one property. Signed-out users and zero-property users get a
  // bare empty state with no header or tabs. While stats load, withhold chrome
  // to avoid a flash that then disappears.
  const showChrome = Boolean(isSignedIn && stats && stats.buildings > 0)

  const ent = stats?.entitlement ?? null
  const planLabel = !ent
    ? null
    : ent.reason === 'enterprise'
      ? 'Enterprise'
      : ent.reason === 'paying'
        ? 'Premium'
        : ent.reason === 'trial'
          ? `Free trial — ${ent.trialDaysLeft ?? 0} day${(ent.trialDaysLeft ?? 0) === 1 ? '' : 's'} left`
          : 'Free — expired'
  const showUpgrade = ent ? ent.reason === 'trial' || ent.reason === 'none' : false

  return (
    <div className="prop-main-content">
      {showChrome ? (
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
            {/* PS logo intentionally removed for now — markup kept for future image support. */}
            {/* <div className="dashboard-logo">PS</div> */}
            <div className="dashboard-identity-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0 }}>{orgPrefix}</h1>
                {showUpgrade ? (
                  <button
                    type="button"
                    className="plan-badge plan-badge-upgrade"
                    onClick={() => {
                      fetch('/api/stripe/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ quantity: 1, return_path: '/dashboard/portfolio' }),
                      })
                        .then((r) => r.json())
                        .then((d: { url?: string; error?: string }) => {
                          if (d.url) window.location.href = d.url
                          else window.alert(d.error || 'Could not open checkout.')
                        })
                        .catch(() => window.alert('Could not open checkout.'))
                    }}
                  >
                    Upgrade now
                  </button>
                ) : null}
              </div>
              <div className="dashboard-identity-sub">
                {planLabel ? `${planLabel} · ` : ''}Last 12 months · {todayStr}
              </div>
            </div>
          </div>

          <div style={headerRightStyle} className="dashboard-header-right">
            {stats ? (
              <>
                <div style={statBlockStyle}>
                  <div style={statValueStyle}>{stats.buildings}</div>
                  <div style={statLabelStyle}>Buildings</div>
                </div>
                <div style={dividerStyle} />
                <div style={statBlockStyle}>
                  <div style={statValueStyle}>{stats.units}</div>
                  <div style={statLabelStyle}>Units</div>
                </div>
                <div style={dividerStyle} />
              </>
            ) : null}
            {isSignedIn && stagedCount > 0 ? (
              <button
                type="button"
                style={reviewQueueBtnStyle}
                onClick={() => setQueueOpen(true)}
              >
                Review added properties
              </button>
            ) : null}
            <button
              type="button"
              style={addPropertyBtnStyle}
              onClick={() => setAddPropOpen(true)}
            >
              + Add property
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            padding: '0 32px',
          }}
        >
          {buildTabs(stats?.is_admin ?? false).map((tab) => {
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
        </div>
      </header>
      ) : null}

      {children}

      <AddPropertyModal isOpen={addPropOpen} onClose={() => setAddPropOpen(false)} />
      <StagedQueueModal
        isOpen={queueOpen}
        onClose={() => setQueueOpen(false)}
        onQueueChange={setStagedCount}
      />
    </div>
  )
}

const headerRightStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
}

const statBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 56,
}

const statValueStyle: CSSProperties = {
  fontFamily: 'var(--sans, "DM Sans", system-ui, sans-serif)',
  fontSize: 16,
  fontWeight: 600,
  color: '#0f2744',
  lineHeight: 1.1,
}

const statLabelStyle: CSSProperties = {
  fontFamily: 'DM Mono, ui-monospace, monospace',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#8a94a0',
  marginTop: 2,
}

const dividerStyle: CSSProperties = {
  width: 1,
  height: 28,
  background: '#e5e1d6',
}

const reviewQueueBtnStyle: CSSProperties = {
  padding: '8px 16px',
  background: '#1e40af',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow:
    'inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 2px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
}

const addPropertyBtnStyle: CSSProperties = {
  padding: '8px 16px',
  background: '#166534',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow:
    'inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 2px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
}