'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from '@clerk/nextjs'
import { formatAddressForDisplay } from '@/lib/formatAddress'

export type SavePropertyModalProps = {
  isOpen: boolean
  /** Pass `true` after a successful save so the header can show a filled bookmark. */
  onClose: (saved?: boolean) => void
  currentAddress: string
  canonicalAddress: string
  slug: string
  isPartOfBuilding: boolean
  /** Detected building range for hint text and optional pre-fill (with currentAddress). */
  buildingAddressRange: string | null
  additionalStreets: string[]
  /** Raw `address_range` for multi-segment buildings (not shown on line 1). */
  portfolioAddressRangeRaw: string | null
  allPins: string[]
  assessorSqft: number | null
  assessorUnits: number | null
  yearBuilt?: string | null
  impliedValue?: number | null
  communityArea?: string | null
  propertyClass?: string | null
}

export default function SavePropertyModal({
  isOpen,
  onClose,
  currentAddress,
  canonicalAddress,
  slug,
  isPartOfBuilding,
  buildingAddressRange,
  additionalStreets: initialAdditionalStreets,
  portfolioAddressRangeRaw,
  allPins,
  assessorSqft,
  assessorUnits,
  yearBuilt = null,
  impliedValue = null,
  communityArea = null,
  propertyClass = null,
}: SavePropertyModalProps) {
  const { user } = useUser()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState(() => formatAddressForDisplay(canonicalAddress))
  const [addressRange, setAddressRange] = useState(() =>
    buildingAddressRange?.trim()
      ? buildingAddressRange.trim()
      : formatAddressForDisplay(canonicalAddress)
  )
  const [additionalStreets, setAdditionalStreets] = useState<string[]>(initialAdditionalStreets || [])
  const [units, setUnits] = useState<string>(assessorUnits?.toString() || '')
  const [sqft, setSqft] = useState<string>(
    assessorSqft != null && Number.isFinite(assessorSqft) ? assessorSqft.toLocaleString('en-US') : ''
  )
  const [notes, setNotes] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [plan, setPlan] = useState<string | null>(null)
  const [showAdditional, setShowAdditional] = useState(false)
  const [entReason, setEntReason] = useState<string | null>(null)
  const [lifetimeSaves, setLifetimeSaves] = useState<number>(0)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setDisplayName(formatAddressForDisplay(canonicalAddress))
    setAddressRange(
      buildingAddressRange?.trim()
        ? buildingAddressRange.trim()
        : formatAddressForDisplay(canonicalAddress)
    )
    setAdditionalStreets(initialAdditionalStreets?.length ? [...initialAdditionalStreets] : [])
    setUnits(assessorUnits?.toString() || '')
    setSqft(
      assessorSqft != null && Number.isFinite(assessorSqft) ? assessorSqft.toLocaleString('en-US') : ''
    )
    setNotes('')
    setAlertsEnabled(true)
    setShowAdditional(false)
  }, [isOpen, canonicalAddress, currentAddress, buildingAddressRange, initialAdditionalStreets, assessorSqft, assessorUnits])

  useEffect(() => {
    if (!isOpen || !user) {
      setPlan(null)
      return
    }
    let cancelled = false
    fetch('/api/profile/update')
      .then((res) => res.json())
      .then((data: {
        profile?: { plan?: string | null } | null
        entitlement?: { reason?: string | null } | null
        lifetime_saves?: number | null
      }) => {
        if (cancelled) return
        setPlan(data.profile?.plan ?? 'free')
        setEntReason(data.entitlement?.reason ?? 'none')
        setLifetimeSaves(Number(data.lifetime_saves ?? 0))
      })
      .catch(() => {
        if (!cancelled) {
          setPlan('free')
          setEntReason('none')
          setLifetimeSaves(0)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, user])

  const handleAddStreet = () => {
    setAdditionalStreets([...additionalStreets, ''])
  }

  const handleRemoveStreet = (index: number) => {
    setAdditionalStreets(additionalStreets.filter((_, i) => i !== index))
  }

  const handleUpdateStreet = (index: number, value: string) => {
    const updated = [...additionalStreets]
    updated[index] = value
    setAdditionalStreets(updated)
  }

  const routeToCheckout = async () => {
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: 1,
          return_path: window.location.pathname + window.location.search,
        }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
        return true
      }
      setError(data.error || 'Could not open checkout.')
    } catch {
      setError('Could not open checkout.')
    }
    return false
  }

  const handleSave = async () => {
    if (!user || !displayName.trim()) return

    setSaving(true)
    setError(null)

    try {
      // Always attempt the save. The server is the authority on the cap —
      // admins, payers, and under-cap trial users save successfully; a
      // genuinely capped user gets a 403 with reason 'save_limit_reached',
      // which is the ONLY case that routes to checkout. This avoids the
      // client guessing the cap (which mis-fired for admins) and guarantees
      // a permitted save actually saves.
      const res = await fetch('/api/dashboard/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_address: canonicalAddress,
          address_range:
            portfolioAddressRangeRaw && portfolioAddressRangeRaw.trim() !== ''
              ? portfolioAddressRangeRaw.trim()
              : addressRange.trim() || null,
          additional_streets: additionalStreets.map((s) => s.trim()).filter(Boolean),
          pins: allPins,
          slug,
          display_name: displayName.trim(),
          units_override: units.trim() ? parseInt(units.replace(/,/g, ''), 10) : null,
          sqft_override: sqft.trim() ? parseInt(sqft.replace(/,/g, ''), 10) : null,
          notes: notes.trim() || null,
          alerts_enabled: alertsEnabled,
          year_built: yearBuilt,
          implied_value: impliedValue,
          community_area: communityArea,
          property_class: propertyClass,
        }),
      })

      if (res.status === 403) {
        const data = (await res.json()) as { reason?: string; error?: string }
        if (data.reason === 'save_limit_reached') {
          // Genuinely capped — convert to a subscribe action.
          const redirecting = await routeToCheckout()
          if (redirecting) return
          setSaving(false)
          return
        }
        throw new Error(data.error || 'Failed to save')
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || 'Failed to save')
      }

      onClose(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveDisabled = saving || !displayName.trim() || !user

  if (!isOpen) return null
  if (typeof window === 'undefined') return null

  return createPortal(
    <div className="save-modal-backdrop" onClick={() => onClose()} role="presentation">
      <div
        className="save-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="save-modal-title"
        aria-modal="true"
      >
        <div className="save-modal-header">
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div id="save-modal-title" className="save-modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#0f2744" stroke="#0f2744" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Save to dashboard
            </div>
            <ul className="save-modal-benefits save-modal-benefits-centered">
              <li>Complete 311 complaint context</li>
              <li>Daily alerts of new activity</li>
            </ul>
          </div>
          <button type="button" className="save-modal-close" onClick={() => onClose()} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="save-modal-body">
          <div className="save-field">
            <label className="save-field-label" htmlFor="save-display-name">
              Property name{' '}
              <span style={{ color: 'var(--red, #c0392b)' }} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="save-display-name"
              className="save-field-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Hyde Park Tower"
              required
              aria-required="true"
            />
          </div>

          <div className="save-field">
            <label className="save-field-label" htmlFor="save-address-primary">
              Address
            </label>
            <div className="save-address-row">
              <input
                id="save-address-primary"
                className="save-field-input"
                type="text"
                value={addressRange}
                onChange={(e) => setAddressRange(e.target.value)}
                placeholder="e.g. 5532-5540 S Hyde Park Blvd"
              />
            </div>
            {additionalStreets.map((street, i) => (
              <div className="save-address-row" key={i}>
                <input
                  className="save-field-input"
                  type="text"
                  value={street}
                  onChange={(e) => handleUpdateStreet(i, e.target.value)}
                  placeholder="e.g. 153-163 W Elm St"
                  aria-label={`Additional street ${i + 1}`}
                />
                <button type="button" className="save-remove-row" onClick={() => handleRemoveStreet(i)}>
                  &times;
                </button>
              </div>
            ))}
            <button type="button" className="save-add-row-btn" onClick={handleAddStreet}>
              + Add another street
            </button>
            {isPartOfBuilding ? (
              <div className="save-field-hint">
                This address is part of a building: {buildingAddressRange?.trim() || currentAddress}.{' '}
                <a href="https://webapps1.chicago.gov/buildingrecords/" target="_blank" rel="noopener noreferrer">
                  Verify on the city&apos;s website
                </a>
              </div>
            ) : (
              <div className="save-field-hint">
                Don&apos;t know your building&apos;s address range?{' '}
                <a href="https://webapps1.chicago.gov/buildingrecords/" target="_blank" rel="noopener noreferrer">
                  Look it up on the city&apos;s website
                </a>
              </div>
            )}
          </div>

          <div className="save-divider" />

          <button
            type="button"
            className="save-additional-toggle"
            onClick={() => setShowAdditional((s) => !s)}
            aria-expanded={showAdditional}
          >
            <span className="save-additional-title">Additional info</span>
            <span className={`save-additional-chevron ${showAdditional ? 'open' : ''}`} aria-hidden="true">
              &#9662;
            </span>
          </button>

          {showAdditional && (
            <div className="save-additional-body">
              <div className="save-field-row">
                <div className="save-field">
                  <label className="save-field-label" htmlFor="save-units">
                    Units
                  </label>
                  <input
                    id="save-units"
                    className="save-field-input"
                    type="text"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder="e.g. 84"
                  />
                </div>
                <div className="save-field">
                  <label className="save-field-label" htmlFor="save-sqft">
                    Sqft
                  </label>
                  <input
                    id="save-sqft"
                    className="save-field-input"
                    type="text"
                    value={sqft}
                    onChange={(e) => setSqft(e.target.value)}
                    placeholder="e.g. 66,800"
                  />
                  {assessorSqft != null && Number.isFinite(assessorSqft) && assessorSqft > 0 && (
                    <div className="save-field-hint">From Cook County Assessor</div>
                  )}
                </div>
              </div>

              <div className="save-field">
                <label className="save-field-label" htmlFor="save-notes">
                  Notes
                </label>
                <textarea
                  id="save-notes"
                  className="save-field-input"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. HOA managed, annual inspection due in March"
                />
              </div>
            </div>
          )}

          <div className="save-divider" />

          <div className="save-toggle-row" style={{ display: 'none' }}>
            <div>
              <div className="save-toggle-label">Enable alerts</div>
              <div className="save-toggle-sub">SMS + email for new complaints, violations, permits</div>
            </div>
            <button
              type="button"
              className={`save-toggle-switch ${alertsEnabled ? 'on' : ''}`}
              onClick={() => setAlertsEnabled(!alertsEnabled)}
              aria-pressed={alertsEnabled}
              aria-label="Enable alerts"
            >
              <span className="save-toggle-knob" />
            </button>
          </div>
          {alertsEnabled && plan === 'premium' && (
            <div className="save-proration-note">
              Adds $10/mo to your subscription, prorated for the rest of this billing cycle.
            </div>
          )}

          {error && <div className="save-error">{error}</div>}
        </div>

        <div className="save-modal-footer save-modal-footer-single">
          <button
            type="button"
            className="save-btn save-btn-save save-btn-alerts"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {(() => {
              if (saving) return 'Saving…'
              if (!user) return 'Sign in to save'
              const isPayer = entReason === 'paying' || entReason === 'enterprise'
              if (isPayer) {
                return <><strong>Save</strong> · $10/month</>
              }
              const remaining = Math.max(0, 3 - lifetimeSaves)
              if (remaining === 0) {
                return 'Subscribe to save'
              }
              return <><strong>Save</strong> · {remaining} of 3 remaining</>
            })()}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
