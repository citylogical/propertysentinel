'use client'

import { SignInButton, useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import BuildingDetectionModal from '@/components/BuildingDetectionModal'
import UnsavePropertyModal from '@/components/UnsavePropertyModal'
import { formatAddressForDisplay } from '@/lib/formatAddress'

export type PortfolioSaveData = {
  currentAddress: string
  canonicalAddress: string
  isPartOfBuilding: boolean
  buildingAddressRange: string | null
  additionalStreets: string[]
  /** Raw multi-street range for API `address_range` when the building spans multiple segments. */
  portfolioAddressRangeRaw: string | null
  allPins: string[]
  assessorSqft: number | null
  assessorUnits: number | null
  yearBuilt: string | null
  impliedValue: number | null
  communityArea: string | null
  propertyClass: string | null
}

type Props = {
  addressRange: string | null
  slug: string
  isExpanded: boolean
  /** True when the header shows the full building range (excludes local-condo-only expansion). */
  isFullBuildingView: boolean
  saveData: PortfolioSaveData
}

export default function AddressBarButtons({
  addressRange,
  slug,
  isExpanded,
  isFullBuildingView,
  saveData,
}: Props) {
  const { isSignedIn, isLoaded } = useUser()
  const [unsaveModalOpen, setUnsaveModalOpen] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isStaged, setIsStaged] = useState(false)
  const [adding, setAdding] = useState(false)
  const [blurb, setBlurb] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const blurbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showBlurb = useCallback((text: string) => {
    if (blurbTimer.current) clearTimeout(blurbTimer.current)
    setBlurb(text)
    blurbTimer.current = setTimeout(() => setBlurb(null), 2200)
  }, [])

  useEffect(() => {
    return () => {
      if (blurbTimer.current) clearTimeout(blurbTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn) {
      setIsSaved(false)
      return
    }
    if (!saveData.canonicalAddress) return
    fetch(`/api/dashboard/save?canonical_address=${encodeURIComponent(saveData.canonicalAddress)}`)
      .then((res) => res.json())
      .then((data: { saved?: boolean }) => setIsSaved(!!data.saved))
      .catch(() => {})
  }, [isSignedIn, saveData.canonicalAddress])

  useEffect(() => {
    if (!isSignedIn) {
      setIsStaged(false)
      return
    }
    if (!saveData.canonicalAddress) return
    fetch(`/api/dashboard/stage?canonical_address=${encodeURIComponent(saveData.canonicalAddress)}`)
      .then((res) => res.json())
      .then((data: { staged?: boolean }) => setIsStaged(!!data.staged))
      .catch(() => {})
  }, [isSignedIn, saveData.canonicalAddress])

  // One-click staging: snapshot the full save payload the page already
  // computed. No modal, no cap, no trial stamp — commitment happens later in
  // the dashboard queue.
  const stageProperty = useCallback(async () => {
    if (adding || !saveData.canonicalAddress) return
    setAdding(true)
    try {
      const res = await fetch('/api/dashboard/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_address: saveData.canonicalAddress,
          slug,
          property_name: formatAddressForDisplay(saveData.canonicalAddress),
          units: saveData.assessorUnits,
          address_range:
            saveData.portfolioAddressRangeRaw?.trim() ||
            saveData.buildingAddressRange?.trim() ||
            formatAddressForDisplay(saveData.canonicalAddress),
          additional_streets: saveData.additionalStreets,
          pins: saveData.allPins,
          sqft: saveData.assessorSqft,
          year_built: saveData.yearBuilt,
          implied_value: saveData.impliedValue,
          community_area: saveData.communityArea,
          property_class: saveData.propertyClass,
        }),
      })
      if (res.ok) {
        setIsStaged(true)
        showBlurb('Added to dashboard')
      } else {
        showBlurb('Could not add — try again')
      }
    } catch {
      showBlurb('Could not add — try again')
    } finally {
      setAdding(false)
    }
  }, [adding, saveData, slug, showBlurb])

  const unstageProperty = useCallback(async () => {
    if (adding || !saveData.canonicalAddress) return
    setAdding(true)
    try {
      const res = await fetch(
        `/api/dashboard/stage?canonical_address=${encodeURIComponent(saveData.canonicalAddress)}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setIsStaged(false)
        showBlurb('Removed from dashboard')
      } else {
        showBlurb('Could not remove — try again')
      }
    } catch {
      showBlurb('Could not remove — try again')
    } finally {
      setAdding(false)
    }
  }, [adding, saveData.canonicalAddress, showBlurb])

  const handleAddClick = () => {
    if (!isLoaded || !isSignedIn) return
    if (isSaved) {
      setUnsaveModalOpen(true)
    } else if (isStaged) {
      void unstageProperty()
    } else {
      void stageProperty()
    }
  }

  // The "See complaint context →" nudge in PropertyFeed dispatches this event.
  // PropertyFeed is rendered deep inside PropertyDataSections (across a Suspense
  // boundary), so an event is cleaner than threading a callback down. Signed-in
  // users get the one-click add; signed-out users get redirected to sign-in (the
  // add button handles that via SignInButton, but the nudge has no wrapper,
  // so we route here).
  useEffect(() => {
    const handler = () => {
      if (!isLoaded) return
      if (!isSignedIn) {
        const returnTo =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}${window.location.search}`
            : '/'
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`
        return
      }
      // Already saved or staged: the nudge is a no-op. Otherwise stage it.
      if (!isSaved && !isStaged) void stageProperty()
    }
    window.addEventListener('ps:open-save-modal', handler)
    return () => window.removeEventListener('ps:open-save-modal', handler)
  }, [isLoaded, isSignedIn, isSaved, isStaged, stageProperty])

  const returnAfterAuth =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${window.location.search}`
      : '/'

  // "+" is the universal add-to-list glyph; it flips to a check once the
  // property is staged (in the dashboard queue) or saved (in the portfolio).
  const addIcon =
    isStaged || isSaved ? (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ) : (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )

  const addTitle = isSaved
    ? 'Saved to your portfolio — click to manage'
    : isStaged
      ? 'In your dashboard — click to remove'
      : 'Add to dashboard'

  return (
    <>
      <div className="property-identity-right address-bar-buttons">
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
          className="address-header-icon-btn"
          title="Copy link to this property"
          aria-label="Copy link"
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

        <span style={{ position: 'relative', display: 'inline-flex' }}>
          {!isLoaded ? (
            <button
              type="button"
              className="address-header-icon-btn address-header-icon-btn-alert"
              title="Add to dashboard"
              aria-label="Add to dashboard"
              disabled
            >
              {addIcon}
            </button>
          ) : !isSignedIn ? (
            <SignInButton mode="modal" forceRedirectUrl={returnAfterAuth} signUpForceRedirectUrl={returnAfterAuth}>
              <button
                type="button"
                className="address-header-icon-btn address-header-icon-btn-alert"
                title="Sign in to add to dashboard"
                aria-label="Sign in to add to dashboard"
              >
                {addIcon}
              </button>
            </SignInButton>
          ) : (
            <button
              type="button"
              className="address-header-icon-btn address-header-icon-btn-alert"
              title={addTitle}
              aria-label={addTitle}
              onClick={handleAddClick}
              disabled={adding}
            >
              {addIcon}
            </button>
          )}
          {blurb && (
            <span
              role="status"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                background: '#0f2744',
                color: '#fff',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 500,
                padding: '6px 10px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
                zIndex: 40,
              }}
            >
              {blurb}
            </span>
          )}
        </span>
      </div>

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
