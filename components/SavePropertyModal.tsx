'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from '@clerk/nextjs'
import type { PortfolioSaveStatsPayload } from '@/lib/portfolio-save-stats'

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
  allPins: string[]
  assessorSqft: number | null
  assessorUnits: number | null
  /** Snapshot from property page (after feed loads); omitted when unavailable */
  portfolioStats?: PortfolioSaveStatsPayload | null
}

function initialAddressLine(buildingAddressRange: string | null, currentAddress: string) {
  const b = buildingAddressRange?.trim()
  if (b) return b
  return currentAddress
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
  allPins,
  assessorSqft,
  assessorUnits,
  portfolioStats = null,
}: SavePropertyModalProps) {
  const { user } = useUser()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState(currentAddress)
  const [addressRange, setAddressRange] = useState(() => initialAddressLine(buildingAddressRange, currentAddress))
  const [additionalStreets, setAdditionalStreets] = useState<string[]>(initialAdditionalStreets || [])
  const [units, setUnits] = useState<string>(assessorUnits?.toString() || '')
  const [sqft, setSqft] = useState<string>(
    assessorSqft != null && Number.isFinite(assessorSqft) ? assessorSqft.toLocaleString('en-US') : ''
  )
  const [notes, setNotes] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setDisplayName(currentAddress)
    setAddressRange(initialAddressLine(buildingAddressRange, currentAddress))
    setAdditionalStreets(initialAdditionalStreets?.length ? [...initialAdditionalStreets] : [])
    setUnits(assessorUnits?.toString() || '')
    setSqft(
      assessorSqft != null && Number.isFinite(assessorSqft) ? assessorSqft.toLocaleString('en-US') : ''
    )
    setNotes('')
    setAlertsEnabled(false)
  }, [isOpen, currentAddress, buildingAddressRange, initialAdditionalStreets, assessorSqft, assessorUnits])

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

  const handleSave = async () => {
    if (!user || !displayName.trim()) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/dashboard/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_address: canonicalAddress,
          address_range: addressRange.trim() || null,
          additional_streets: additionalStreets.map((s) => s.trim()).filter(Boolean),
          pins: allPins,
          slug,
          display_name: displayName.trim(),
          units_override: units.trim() ? parseInt(units.replace(/,/g, ''), 10) : null,
          sqft_override: sqft.trim() ? parseInt(sqft.replace(/,/g, ''), 10) : null,
          notes: notes.trim() || null,
          alerts_enabled: alertsEnabled,
          ...(portfolioStats
            ? {
                open_complaints: portfolioStats.open_complaints,
                total_complaints_12mo: portfolioStats.total_complaints_12mo,
                open_violations: portfolioStats.open_violations,
                total_violations_12mo: portfolioStats.total_violations_12mo,
                total_permits_12mo: portfolioStats.total_permits_12mo,
                shvr_count: portfolioStats.shvr_count,
                has_stop_work: portfolioStats.has_stop_work,
                implied_value: portfolioStats.implied_value,
                property_class: portfolioStats.property_class,
                year_built: portfolioStats.year_built,
                community_area: portfolioStats.community_area,
                stats_updated_at: portfolioStats.stats_updated_at,
              }
            : {}),
        }),
      })

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
          <div>
            <div id="save-modal-title" className="save-modal-title">
              Save to dashboard
            </div>
            <div className="save-modal-sub">{currentAddress}</div>
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

          <div className="save-divider" />

          <div className="save-toggle-row">
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

          {error && <div className="save-error">{error}</div>}
        </div>

        <div className="save-modal-footer">
          <button type="button" className="save-btn save-btn-cancel" onClick={() => onClose()}>
            Cancel
          </button>
          <button
            type="button"
            className="save-btn save-btn-save"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {saving ? 'Saving...' : !user ? 'Sign in to save' : 'Save to dashboard'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
