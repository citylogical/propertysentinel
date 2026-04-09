'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import BuildingDetectionModal from '@/components/BuildingDetectionModal'
import SavePropertyModal from '@/components/SavePropertyModal'
import UnsavePropertyModal from '@/components/UnsavePropertyModal'

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
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [unsaveModalOpen, setUnsaveModalOpen] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    if (!saveData.canonicalAddress) return
    fetch(`/api/portfolio/save?canonical_address=${encodeURIComponent(saveData.canonicalAddress)}`)
      .then((res) => res.json())
      .then((data: { saved?: boolean }) => setIsSaved(!!data.saved))
      .catch(() => {})
  }, [saveData.canonicalAddress])

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

        <button
          type="button"
          className="address-header-icon-btn address-header-icon-btn-alert"
          title={isSaved ? 'Remove from portfolio' : 'Save to portfolio'}
          aria-label="Save to portfolio"
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
