'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { resolveStreetAndZipForNavigation } from '@/lib/google-places-address'
import { fetchPlaceDetailsForNavigation, type AddressSuggestion } from '@/lib/google-maps-loader'
import { useAddressAutocomplete } from '@/lib/use-address-autocomplete'

const FORM_ID = 'home-search-form'

type HomeSearchProps = {
  apiKey: string | undefined
  /** When true, hide the submit button (e.g. for drawer); Enter still submits */
  hideSubmitButton?: boolean
}

export default function HomeSearch({ apiKey, hideSubmitButton }: HomeSearchProps) {
  const [address, setAddress] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const { suggestions, clearSuggestions } = useAddressAutocomplete(apiKey ? address : '')
  const safeHighlighted =
    suggestions.length === 0 ? 0 : Math.min(highlighted, suggestions.length - 1)

  async function selectSuggestion(s: AddressSuggestion) {
    const place = await fetchPlaceDetailsForNavigation(s.placeId)
    const resolved = place ? resolveStreetAndZipForNavigation(address, place) : null
    if (resolved?.street) {
      setAddress(resolved.street)
      if (zipInputRef.current) zipInputRef.current.value = resolved.zip ?? ''
    } else {
      const first = s.description.split(',')[0]?.trim() ?? ''
      setAddress(first || s.description)
    }
    clearSuggestions()
    setSuggestionsOpen(false)
    formRef.current?.requestSubmit()
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
    <div className="search-wrap">
      <form
        ref={formRef}
        id={FORM_ID}
        action="/search"
        method="GET"
        className={hideSubmitButton ? 'search-bar search-bar-no-btn' : 'search-bar'}
      >
        <input ref={zipInputRef} type="hidden" id="home-search-zip" name="zip" defaultValue="" />
        <div className="search-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </div>
        <input
          id="homesearch-address-input"
          type="text"
          name="address"
          required={!hideSubmitButton}
          placeholder="Enter a Chicago address…"
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
        {!hideSubmitButton && (
          <button type="submit" className="search-btn">
            Search
          </button>
        )}
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
  )
}
