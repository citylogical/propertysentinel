'use client'

import { useUser } from '@clerk/nextjs'
import Script from 'next/script'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import BuildingDetectionModal from '@/components/BuildingDetectionModal'
import SavePropertyModal from '@/components/SavePropertyModal'
import UnsavePropertyModal from '@/components/UnsavePropertyModal'
import { addressToSlug } from '@/lib/address-slug'
import { CHICAGO_METRO_BOUNDS, resolveStreetAndZipForNavigation } from '@/lib/google-places-address'

const ADDRESS_HEADER_SEARCH_INPUT_ID = 'address-header-search-input'

export type PortfolioSaveData = {
  currentAddress: string
  canonicalAddress: string
  isPartOfBuilding: boolean
  buildingAddressRange: string | null
  additionalStreets: string[]
  allPins: string[]
  assessorSqft: number | null
  assessorUnits: number | null
}

declare global {
  interface Window {
    initAddressHeaderAutocomplete?: () => void
  }
}

function initAddressHeaderAutocomplete(): void {
  const input = document.getElementById(ADDRESS_HEADER_SEARCH_INPUT_ID) as HTMLInputElement | null
  if (!input || !window.google?.maps?.places?.Autocomplete) return
  if ((window as Window & { __psAddressHeaderAutocompleteInited?: boolean }).__psAddressHeaderAutocompleteInited) return
  ;(window as Window & { __psAddressHeaderAutocompleteInited?: boolean }).__psAddressHeaderAutocompleteInited = true

  let lastTyped = input.value
  input.addEventListener('input', () => {
    lastTyped = input.value
  })

  const autocomplete = new window.google.maps.places.Autocomplete(input, {
    types: ['address'],
    componentRestrictions: { country: 'us' },
    bounds: CHICAGO_METRO_BOUNDS,
    strictBounds: false,
  })

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace()
    if (!place.address_components && !place.formatted_address) return
    const resolved = resolveStreetAndZipForNavigation(lastTyped, place)
    if (!resolved?.street) return
    const { street, zip } = resolved
    const zipInput = document.getElementById('address-header-zip') as HTMLInputElement | null
    if (zipInput) zipInput.value = zip ?? ''
    const slug = addressToSlug(street, zip)
    window.location.href = `/address/${encodeURIComponent(slug)}`
  })
}

type Props = {
  addressRange: string | null
  slug: string
  isExpanded: boolean
  /** True when the header shows the full building range (excludes local-condo-only expansion). */
  isFullBuildingView: boolean
  apiKey?: string
  saveData: PortfolioSaveData
}

export default function AddressBarButtons({
  addressRange,
  slug,
  isExpanded,
  isFullBuildingView,
  apiKey,
  saveData,
}: Props) {
  const { isSignedIn, isLoaded } = useUser()
  const registeredRef = useRef(false)
  const initedRef = useRef(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [unsaveModalOpen, setUnsaveModalOpen] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    if (!apiKey || registeredRef.current) return
    registeredRef.current = true
    window.initAddressHeaderAutocomplete = initAddressHeaderAutocomplete
    return () => {
      delete window.initAddressHeaderAutocomplete
    }
  }, [apiKey])

  useEffect(() => {
    if (!apiKey) return
    ;(window as Window & { __psAddressHeaderAutocompleteInited?: boolean }).__psAddressHeaderAutocompleteInited = false
    initedRef.current = false

    const run = () => {
      if (initedRef.current) return
      const input = document.getElementById(ADDRESS_HEADER_SEARCH_INPUT_ID)
      if (!input || !window.google?.maps?.places?.Autocomplete) return
      initedRef.current = true
      initAddressHeaderAutocomplete()
    }

    run()
    const timeoutId = setTimeout(run, 500)
    const intervalId = setInterval(run, 1000)
    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
      ;(window as Window & { __psAddressHeaderAutocompleteInited?: boolean }).__psAddressHeaderAutocompleteInited = false
    }
  }, [apiKey])

  useEffect(() => {
    if (!saveData.canonicalAddress) return
    fetch(`/api/portfolio/save?canonical_address=${encodeURIComponent(saveData.canonicalAddress)}`)
      .then((res) => res.json())
      .then((data: { saved?: boolean }) => setIsSaved(!!data.saved))
      .catch(() => {})
  }, [saveData.canonicalAddress])

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const address = (form.querySelector('input[name="address"]') as HTMLInputElement)?.value?.trim()
    const zip = (form.querySelector('input[name="zip"]') as HTMLInputElement)?.value?.trim()
    if (!address) return
    const nextSlug = addressToSlug(address, zip || undefined)
    window.location.href = `/address/${encodeURIComponent(nextSlug)}`
  }

  const openSaveFlow = () => {
    if (!isLoaded) return
    if (!isSignedIn) {
      window.location.href = '/sign-in'
      return
    }
    if (isSaved) {
      setUnsaveModalOpen(true)
    } else {
      setSaveModalOpen(true)
    }
  }

  return (
    <>
      {apiKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initAddressHeaderAutocomplete`}
          strategy="afterInteractive"
        />
      )}
      <div className="address-bar-buttons">
        <div className="address-header-search-wrap">
          <svg className="address-header-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <form action="/search" method="GET" onSubmit={handleSearchSubmit}>
            <input type="hidden" name="zip" value="" id="address-header-zip" />
            <input
              id={ADDRESS_HEADER_SEARCH_INPUT_ID}
              className="address-header-search-input"
              type="text"
              name="address"
              placeholder="New Chicago search..."
              autoComplete="off"
            />
          </form>
        </div>

        {/* Share link */}
        <button
          type="button"
          className="address-header-icon-btn"
          title="Copy link"
          onClick={() => {
            void navigator.clipboard.writeText(window.location.href)
            setShareCopied(true)
            setTimeout(() => setShareCopied(false), 1500)
          }}
        >
          {shareCopied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f2744" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </button>

        <BuildingDetectionModal
          isPartOfBuilding={!!(saveData.buildingAddressRange && saveData.isPartOfBuilding)}
          addressRange={addressRange ?? saveData.buildingAddressRange}
          slug={slug}
          searchedAddress={saveData.canonicalAddress}
          isExpanded={isExpanded}
          isFullBuildingView={isFullBuildingView}
        />

        <button
          type="button"
          className="address-header-icon-btn address-header-icon-btn-alert"
          title={isSaved ? 'Remove from portfolio' : 'Save to portfolio'}
          onClick={openSaveFlow}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved ? '#fff' : 'none'} stroke="#fff" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      <SavePropertyModal
        isOpen={saveModalOpen}
        onClose={(saved) => {
          setSaveModalOpen(false)
          if (saved) setIsSaved(true)
        }}
        currentAddress={saveData.currentAddress}
        canonicalAddress={saveData.canonicalAddress}
        slug={slug}
        isPartOfBuilding={saveData.isPartOfBuilding}
        buildingAddressRange={saveData.buildingAddressRange}
        additionalStreets={saveData.additionalStreets}
        allPins={saveData.allPins}
        assessorSqft={saveData.assessorSqft}
        assessorUnits={saveData.assessorUnits}
      />
      <UnsavePropertyModal
        isOpen={unsaveModalOpen}
        onClose={(didUnsave) => {
          setUnsaveModalOpen(false)
          if (didUnsave) setIsSaved(false)
        }}
        displayName={saveData.buildingAddressRange || saveData.currentAddress}
        canonicalAddress={saveData.canonicalAddress}
      />
    </>
  )
}
