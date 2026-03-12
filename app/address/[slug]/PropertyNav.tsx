'use client'

import Link from 'next/link'
import { useRef, useState, useEffect } from 'react'

export default function PropertyNav() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = e.currentTarget.querySelector('input[name="address"]') as HTMLInputElement
    const address = input?.value?.trim()
    if (!address) return
    const slug = address.replace(/\s+/g, '-')
    window.location.href = `/address/${encodeURIComponent(slug)}`
  }

  return (
    <nav className="prop-nav">
      <Link className="nav-brand" href="/">
        Property Sentinel
      </Link>
      <div className="nav-right">
        <div className="nav-search-wrap">
          <svg
            className="nav-search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <form action="/search" method="GET" onSubmit={handleSearchSubmit}>
            <input
              className="nav-search-input"
              type="text"
              name="address"
              placeholder="New Chicago search…"
            />
          </form>
        </div>
        <div
          className={`nav-dropdown ${dropdownOpen ? 'open' : ''}`}
          ref={dropdownRef}
        >
          <button
            type="button"
            className="nav-dropdown-btn"
            onClick={() => setDropdownOpen((o) => !o)}
          >
            About
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div className="nav-dropdown-panel">
            <Link className="nav-dropdown-row" href="/" onClick={() => setDropdownOpen(false)}>
              <div className="nav-dropdown-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div>
                <div className="nav-dropdown-label">Property Sentinel</div>
                <div className="nav-dropdown-desc">Real-time monitoring for Chicago landlords and STR operators</div>
              </div>
            </Link>
            <Link className="nav-dropdown-row" href="/#how" onClick={() => setDropdownOpen(false)}>
              <div className="nav-dropdown-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <div className="nav-dropdown-label">How it works</div>
                <div className="nav-dropdown-desc">Where the data comes from and what we monitor</div>
              </div>
            </Link>
            <Link className="nav-dropdown-row" href="/#contact" onClick={() => setDropdownOpen(false)}>
              <div className="nav-dropdown-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <div className="nav-dropdown-label">Contact</div>
                <div className="nav-dropdown-desc">Questions, partnerships, or press inquiries</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
