'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAddressSuggestions, type AddressSuggestion } from './google-maps-loader'

export type { AddressSuggestion }

/**
 * React hook for debounced address autocomplete. Wraps fetchAddressSuggestions
 * with a 250ms debounce and returns suggestions + loading state.
 *
 * Biased toward Chicago is applied post-fetch by ranking descriptions containing
 * "IL" higher than others (soft bias — doesn't reject non-IL results).
 */
export function useAddressAutocomplete(input: string) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestInputRef = useRef<string>('')

  useEffect(() => {
    latestInputRef.current = input
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!input || input.trim().length < 3) {
      setSuggestions([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await fetchAddressSuggestions(input)
          if (latestInputRef.current !== input) return

          const sorted = [...results].sort((a, b) => {
            const aIL = /\bIL\b/.test(a.description) ? -1 : 0
            const bIL = /\bIL\b/.test(b.description) ? -1 : 0
            return aIL - bIL
          })
          setSuggestions(sorted.slice(0, 6))
        } catch (err) {
          console.warn('[autocomplete] fetch failed:', err)
          setSuggestions([])
        } finally {
          if (latestInputRef.current === input) setLoading(false)
        }
      })()
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input])

  const clearSuggestions = useCallback(() => {
    setSuggestions([])
  }, [])

  return { suggestions, loading, clearSuggestions }
}
