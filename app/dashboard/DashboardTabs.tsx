'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard/portfolio', label: 'Portfolio' },
  { href: '/dashboard/activity', label: 'Activity Feed' },
]

export default function DashboardTabs() {
  const pathname = usePathname()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        padding: '0 32px',
        borderBottom: '1px solid #e5e1d6',
        background: 'var(--bg)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
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
    </div>
  )
}
