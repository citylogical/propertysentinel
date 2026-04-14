'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { resolveStreetAndZipForNavigation } from '@/lib/google-places-address'
import { fetchPlaceDetailsForNavigation, type AddressSuggestion } from '@/lib/google-maps-loader'
import { useAddressAutocomplete } from '@/lib/use-address-autocomplete'

const FORM_ID = 'search-page-form'

type Props = {
  apiKey: string | undefined
}

export default function SearchHero({ apiKey }: Props) {
  const [address, setAddress] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const { suggestions, clearSuggestions } = useAddressAutocomplete(apiKey ? address : '')
  const safeHighlighted =
    suggestions.length === 0 ? 0 : Math.min(highlighted, suggestions.length - 1)

  async function selectSuggestion(s: AddressSuggestion) {
    const place = await fetchPlaceDetailsForNavigation(s.placeId)
    const resolved = place ? resolveStreetAndZipForNavigation(address, place) : null

    const finalAddress = resolved?.street
      ? resolved.street
      : (s.description.split(',')[0]?.trim() ?? s.description)
    const finalZip = resolved?.zip ?? ''

    // Update React state so the input reflects the selection if the user looks back
    setAddress(finalAddress)
    if (zipInputRef.current) zipInputRef.current.value = finalZip

    clearSuggestions()
    setSuggestionsOpen(false)

    // Navigate directly with the resolved values instead of relying on form state.
    // requestSubmit() reads from the DOM, which won't have flushed React's setAddress yet.
    const params = new URLSearchParams({ address: finalAddress })
    if (finalZip) params.set('zip', finalZip)
    window.location.href = `/search?${params.toString()}`
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
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

  return (
    <div className="search-hero">
      <div className="search-hero-grid" aria-hidden />
      <div className="search-hero-inner">
        <div className="search-hero-bar-wrap">
          <form id={FORM_ID} action="/search" method="GET" className="search-bar">
            <input ref={zipInputRef} type="hidden" id="search-page-zip" name="zip" defaultValue="" />
            <div className="search-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <input
              id="search-page-address"
              type="text"
              name="address"
              required
              placeholder="Enter a Chicago address..."
              autoComplete="off"
              spellCheck={false}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value)
                setHighlighted(0)
                setSuggestionsOpen(true)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={handleSearchKeyDown}
            />
            <button type="submit" className="search-btn">
              Search
            </button>
          </form>
          {apiKey && suggestionsOpen && suggestions.length > 0 ? (
            <div className="ps-address-suggestions" role="listbox">
              {suggestions.map((s, idx) => (
                <button
                  type="button"
                  key={s.placeId}
                  role="option"
                  aria-selected={idx === safeHighlighted}
                  className={
                    idx === safeHighlighted ? 'ps-address-suggestion ps-address-suggestion-active' : 'ps-address-suggestion'
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
      </div>
    </div>
  )
}
