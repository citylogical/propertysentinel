'use client'

import Link from 'next/link'
import { useRef, useState, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { addressToSlug } from '@/lib/address-slug'
import { resolveStreetAndZipForNavigation } from '@/lib/google-places-address'
import { fetchPlaceDetailsForNavigation, type AddressSuggestion } from '@/lib/google-maps-loader'
import { useAddressAutocomplete } from '@/lib/use-address-autocomplete'
import MobileNavDrawer from '@/app/components/MobileNavDrawer'
import NavMenuDropdown from '@/app/components/NavMenuDropdown'
import HamburgerIcon from '@/app/components/HamburgerIcon'

type PropertyNavProps = { apiKey?: string }

export default function PropertyNav({ apiKey }: PropertyNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [addressValue, setAddressValue] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const { suggestions, clearSuggestions } = useAddressAutocomplete(apiKey ? addressValue : '')
  const safeHighlighted =
    suggestions.length === 0 ? 0 : Math.min(highlighted, suggestions.length - 1)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  async function selectSuggestion(s: AddressSuggestion) {
    const place = await fetchPlaceDetailsForNavigation(s.placeId)
    const resolved = place ? resolveStreetAndZipForNavigation(addressValue, place) : null
    if (resolved?.street) {
      if (zipInputRef.current) zipInputRef.current.value = resolved.zip ?? ''
      const slug = addressToSlug(resolved.street, resolved.zip)
      window.location.href = `/address/${slug}`
    } else {
      const firstPart = s.description.split(',')[0]?.trim() ?? ''
      if (firstPart) {
        window.location.href = `/address/${encodeURIComponent(addressToSlug(firstPart))}`
      }
    }
    setAddressValue('')
    setSuggestionsOpen(false)
    clearSuggestions()
  }

  function handleNavSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setHighlighted((h) => (h + 1) % suggestions.length)
      setSuggestionsOpen(true)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setHighlighted((h) => (h === 0 ? suggestions.length - 1 : h - 1))
      setSuggestionsOpen(true)
      return
    }
    if (e.key === 'Enter') {
      if (suggestionsOpen && suggestions.length > 0) {
        e.preventDefault()
        void selectSuggestion(suggestions[safeHighlighted])
      }
      return
    }
    if (e.key === 'Escape') {
      setSuggestionsOpen(false)
      clearSuggestions()
    }
  }

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const address = (form.querySelector('input[name="address"]') as HTMLInputElement)?.value?.trim()
    const zip = (form.querySelector('input[name="zip"]') as HTMLInputElement)?.value?.trim()
    if (!address) return
    const slug = addressToSlug(address, zip || undefined)
    window.location.href = `/address/${slug}`
  }

  return (
    <>
      <nav className="prop-nav">
        <Link className="nav-brand" href="/">
          <span className="brand-wordmark-line">Property</span>
          <span className="brand-wordmark-line">Sentinel</span>
        </Link>

        <button
          type="button"
          className="nav-hamburger md:hidden flex items-center justify-center w-10 h-10 text-white border-0 bg-transparent cursor-pointer p-0"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <HamburgerIcon />
        </button>

        <div className="nav-right hidden md:flex">
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
              <input type="hidden" name="zip" defaultValue="" id="prop-nav-zip" ref={zipInputRef} />
              <input
                className="nav-search-input"
                type="text"
                name="address"
                placeholder="New Chicago search…"
                autoComplete="off"
                spellCheck={false}
                value={addressValue}
                onChange={(e) => {
                  setAddressValue(e.target.value)
                  setHighlighted(0)
                  setSuggestionsOpen(true)
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  setSearchFocused(false)
                  setTimeout(() => setSuggestionsOpen(false), 150)
                }}
                onKeyDown={handleNavSearchKeyDown}
                style={{
                  width: searchFocused ? 360 : 320,
                  transition: 'background 0.15s, border-color 0.15s, width 0.2s',
                }}
              />
            </form>
            {apiKey && suggestionsOpen && suggestions.length > 0 ? (
              <div className="prop-nav-address-suggestions" role="listbox">
                {suggestions.map((s, idx) => (
                  <button
                    type="button"
                    key={s.placeId}
                    role="option"
                    aria-selected={idx === safeHighlighted}
                    className={
                      idx === safeHighlighted
                        ? 'prop-nav-address-suggestion prop-nav-address-suggestion-active'
                        : 'prop-nav-address-suggestion'
                    }
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      void selectSuggestion(s)
                    }}
                    onMouseEnter={() => setHighlighted(idx)}
                  >
                    {s.description}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div
            ref={menuRef}
            className="relative flex items-center"
            onMouseEnter={() => {
              if (typeof window !== 'undefined' && window.innerWidth >= 769) setMenuOpen(true)
            }}
            onMouseLeave={() => {
              if (typeof window !== 'undefined' && window.innerWidth >= 769) setMenuOpen(false)
            }}
          >
            <button
              type="button"
              className="nav-hamburger flex items-center justify-center w-10 h-10 text-white border-0 bg-transparent cursor-pointer p-0"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <HamburgerIcon />
            </button>
            {menuOpen && (
              <NavMenuDropdown
                onClose={() => setMenuOpen(false)}
                apiKey={apiKey}
              />
            )}
          </div>
        </div>
      </nav>

      <MobileNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} apiKey={apiKey} />
    </>
  )
}
