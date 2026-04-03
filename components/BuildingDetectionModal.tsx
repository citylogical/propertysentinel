'use client'

import { SignInButton, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const BUILDING_MODAL_DISMISS_COOKIE = 'ps-building-modal-dismissed'

function readDismissCookie(): boolean {
  if (typeof document === 'undefined') return false
  for (const part of document.cookie.split(';')) {
    const [k, v] = part.trim().split('=').map((s) => s.trim())
    if (k === BUILDING_MODAL_DISMISS_COOKIE && v === 'true') return true
  }
  return false
}

function writeDismissCookie(): void {
  document.cookie = `${BUILDING_MODAL_DISMISS_COOKIE}=true;path=/;max-age=31536000;SameSite=Lax`
}

type Props = {
  isPartOfBuilding: boolean
  addressRange: string | null
  slug: string
  searchedAddress: string
  /** Any expanded data view (local condo multi-PIN, full building, etc.) — suppresses auto modal. */
  isExpanded: boolean
  /** Header shows full building range (not local-condo-only expansion). */
  isFullBuildingView: boolean
}

export default function BuildingDetectionModal({
  isPartOfBuilding,
  addressRange,
  slug,
  searchedAddress,
  isExpanded,
  isFullBuildingView,
}: Props) {
  const { isSignedIn } = useUser()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'detected' | 'suggest'>('detected')
  const [dismissed, setDismissed] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [streetCount, setStreetCount] = useState(1)
  const [street1, setStreet1] = useState('')
  const [street2, setStreet2] = useState('')
  const [street3, setStreet3] = useState('')
  const [street4, setStreet4] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)

  useEffect(() => {
    if (readDismissCookie()) setDismissed(true)
  }, [])

  useEffect(() => {
    if (isSignedIn) setNeedsSignIn(false)
  }, [isSignedIn])

  useEffect(() => {
    if (isPartOfBuilding && addressRange && !dismissed && !isExpanded) {
      setModalType('detected')
      setShowModal(true)
    }
  }, [isPartOfBuilding, addressRange, dismissed, isExpanded])

  const handleIconClick = () => {
    setSubmitted(false)
    setNeedsSignIn(false)
    if (isPartOfBuilding) {
      if (isFullBuildingView) {
        setModalType('suggest')
      } else {
        setModalType('detected')
      }
    } else {
      setModalType('suggest')
    }
    setShowModal(true)
  }

  const closeModal = () => {
    if (modalType === 'detected' && dontShowAgain) {
      writeDismissCookie()
      setDismissed(true)
    }
    setShowModal(false)
  }

  const viewFullBuilding = () => {
    if (dontShowAgain) {
      writeDismissCookie()
      setDismissed(true)
    }
    setShowModal(false)
    router.push(`/address/${encodeURIComponent(slug)}?building=true`)
  }

  const handleSubmit = async () => {
    if (!isSignedIn) {
      setNeedsSignIn(true)
      return
    }
    if (!street1.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/building-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searched_address: searchedAddress,
          street1_range: street1.trim(),
          street2_range: streetCount >= 2 ? street2.trim() || null : null,
          street3_range: streetCount >= 3 ? street3.trim() || null : null,
          street4_range: streetCount >= 4 ? street4.trim() || null : null,
        }),
      })
      const data = await res.json()
      if (!data.error) {
        setSubmitted(true)
        if (data.autoApproved) setTimeout(() => window.location.reload(), 2000)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const bldgSvg = (color: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9v.01" />
      <path d="M9 12v.01" />
      <path d="M9 15v.01" />
      <path d="M9 18v.01" />
    </svg>
  )

  const iconBtnClass = [
    'address-header-icon-btn',
    isPartOfBuilding ? 'address-header-icon-btn-building' : '',
    isPartOfBuilding && !isExpanded ? 'address-header-icon-btn-building-flash' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <button
        type="button"
        className={iconBtnClass}
        title={isPartOfBuilding ? 'Building with multiple addresses' : 'Submit building range'}
        onClick={handleIconClick}
      >
        {bldgSvg(isPartOfBuilding ? '#92400e' : '#0f2744')}
      </button>

      {showModal &&
        typeof window !== 'undefined' &&
        createPortal(
          <div className="building-modal-overlay">
            {modalType === 'detected' && !isFullBuildingView && (
              <div className="building-modal">
                <button type="button" className="building-modal-x" onClick={closeModal} aria-label="Close">
                  &times;
                </button>
                <div className="building-modal-icon building-modal-icon-amber">{bldgSvg('#d97706')}</div>
                <div className="building-modal-title">This address appears to belong to a building with multiple addresses</div>
                <div className="building-modal-range">{addressRange}</div>
                <div className="building-modal-buttons">
                  <button type="button" className="building-modal-btn building-modal-btn-amber" onClick={viewFullBuilding}>
                    View full building
                  </button>
                  <button type="button" className="building-modal-btn building-modal-btn-outline" onClick={closeModal}>
                    View single address
                  </button>
                </div>
                <div className="building-modal-dismiss">
                  <input
                    type="checkbox"
                    className="building-modal-checkbox"
                    id="bldg-dismiss"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                  />
                  <label className="building-modal-dismiss-label" htmlFor="bldg-dismiss">
                    Don&apos;t show me this again
                  </label>
                </div>
              </div>
            )}

            {modalType === 'suggest' && (
              <div className="building-modal">
                <button type="button" className="building-modal-x" onClick={() => setShowModal(false)} aria-label="Close">
                  &times;
                </button>
                <div className={`building-modal-icon ${isPartOfBuilding ? 'building-modal-icon-amber' : 'building-modal-icon-grey'}`}>
                  {bldgSvg(isPartOfBuilding ? '#d97706' : '#8a94a0')}
                </div>

                {submitted ? (
                  <>
                    <div className="building-modal-title">Thank you for your submission.</div>
                    <div className="building-modal-subtitle">We will review the proposed address range as soon as possible.</div>
                  </>
                ) : (
                  <>
                    <div className="building-modal-title">
                      {isPartOfBuilding ? 'This building has multiple addresses' : 'This address does not appear to belong to a building with multiple addresses'}
                    </div>
                    <div className="building-modal-subtitle">{isPartOfBuilding ? 'Think this is wrong? Submit a correction.' : 'Do you think it should?'}</div>

                    <div className="building-modal-field-label">Street 1 — address range</div>
                    <input
                      className="building-modal-input"
                      placeholder="e.g. 5532–5540 S Hyde Park Blvd"
                      value={street1}
                      onChange={(e) => setStreet1(e.target.value)}
                    />

                    {streetCount >= 2 && (
                      <>
                        <div className="building-modal-field-label">Street 2 — address range</div>
                        <input
                          className="building-modal-input"
                          placeholder="e.g. 153–163 W Elm St"
                          value={street2}
                          onChange={(e) => setStreet2(e.target.value)}
                        />
                      </>
                    )}
                    {streetCount >= 3 && (
                      <>
                        <div className="building-modal-field-label">Street 3 — address range</div>
                        <input
                          className="building-modal-input"
                          placeholder="e.g. 200–210 N State St"
                          value={street3}
                          onChange={(e) => setStreet3(e.target.value)}
                        />
                      </>
                    )}
                    {streetCount >= 4 && (
                      <>
                        <div className="building-modal-field-label">Street 4 — address range</div>
                        <input
                          className="building-modal-input"
                          placeholder="e.g. 100–108 E Oak St"
                          value={street4}
                          onChange={(e) => setStreet4(e.target.value)}
                        />
                      </>
                    )}

                    {streetCount < 4 && (
                      <button type="button" className="building-modal-add-street" onClick={() => setStreetCount((c) => Math.min(c + 1, 4))}>
                        + Add another street
                      </button>
                    )}

                    <div className="building-modal-hint">
                      <a href="https://webapps1.chicago.gov/buildingrecords/" target="_blank" rel="noopener noreferrer">
                        Verify address ranges on the city website
                      </a>
                    </div>

                    {needsSignIn && (
                      <div style={{ marginBottom: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: '#4a5568', marginBottom: 8 }}>
                          Sign in to submit an address range
                        </div>
                        <SignInButton mode="modal">
                          <button type="button" className="building-modal-btn building-modal-btn-navy building-modal-btn-full">
                            Sign in
                          </button>
                        </SignInButton>
                      </div>
                    )}

                    {!needsSignIn && (
                      <button
                        type="button"
                        className="building-modal-btn building-modal-btn-navy building-modal-btn-full"
                        onClick={handleSubmit}
                        disabled={submitting || !street1.trim()}
                      >
                        {submitting ? 'Submitting…' : isPartOfBuilding ? 'Submit a correction' : 'Submit building address range'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  )
}
