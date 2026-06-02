'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'

type HeaderStats = {
  buildings: number
  units: number
  organization: string | null
  is_admin: boolean
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
              <h1>{orgPrefix}</h1>
              <div className="dashboard-identity-sub">Last 12 months · {todayStr}</div>
            </div>
          </div>

          <div style={headerRightStyle}>
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
            <button
              type="button"
              style={addPropertyBtnStyle}
              onClick={() => {
                // Re-uses the existing Cmd+K bind to open the add-property flow.
                // PortfolioTable / search modal listens for this event.
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
                )
              }}
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

      {children}
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
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 20,
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