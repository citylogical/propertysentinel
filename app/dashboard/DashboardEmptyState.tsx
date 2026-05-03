'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { SignInButton } from '@clerk/nextjs'

type Props = {
  kind: 'signed_out' | 'no_properties'
  context: 'portfolio' | 'activity'
}

export default function DashboardEmptyState({ kind, context }: Props) {
  const isSignedOut = kind === 'signed_out'
  const isPortfolio = context === 'portfolio'

  const title = isSignedOut
    ? `Sign in or sign up to view your ${isPortfolio ? 'portfolio' : 'activity feed'}`
    : isPortfolio
      ? 'Add your first property to your portfolio'
      : 'No activity yet — add a property to start tracking'

  const body = isSignedOut
    ? 'Track 311 complaints, building violations, and permits across every property you own or manage in Chicago.'
    : isPortfolio
      ? 'Search any Chicago address and click the bookmark icon to start tracking complaints, violations, and permits.'
      : 'Once you add properties to your portfolio, every new complaint, violation, and permit shows up here automatically.'

  const ctaButtonStyle: CSSProperties = {
    display: 'inline-block',
    padding: '10px 22px',
    background: '#0f2744',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {isPortfolio ? (
        <div
          className="dashboard-banner-row"
          style={{ marginBottom: 16, opacity: 0.5, pointerEvents: 'none' }}
        >
          <div className="dashboard-banner dashboard-banner-monitor">
            <span>
              <strong>Set up real-time monitoring</strong> — get alerts the moment something hits your portfolio
            </span>
            <button type="button" className="dashboard-banner-monitor-btn" disabled>
              Set up →
            </button>
          </div>
          <div className="dashboard-banner dashboard-banner-right">
            <div className="dashboard-banner-right-left">
              <div className="dashboard-banner-count">0</div>
              <div className="dashboard-banner-count-text">
                <strong>properties tracked</strong>
                <br />
                {isSignedOut ? 'Sign in to start saving properties' : 'Search any address to add your first one'}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="dashboard-table-wrap"
        style={{
          padding: '64px 24px',
          textAlign: 'center',
          background: '#fff',
        }}
      >
        <div
          style={{
            fontFamily: 'Merriweather, Georgia, serif',
            fontSize: 18,
            fontWeight: 600,
            color: '#0f2744',
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#6b7280',
            lineHeight: 1.6,
            maxWidth: 460,
            margin: '0 auto 20px',
          }}
        >
          {body}
        </div>
        {isSignedOut ? (
          <SignInButton mode="modal">
            <button type="button" style={ctaButtonStyle}>
              Sign in
            </button>
          </SignInButton>
        ) : (
          <Link href="/" style={ctaButtonStyle}>
            {isPortfolio ? 'Search an address' : 'Add a property'}
          </Link>
        )}
      </div>
    </div>
  )
}
