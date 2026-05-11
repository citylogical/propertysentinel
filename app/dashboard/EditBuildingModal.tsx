'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatAddressForDisplay } from '@/lib/formatAddress'
import type { PortfolioProperty } from './types'

export type EditBuildingModalProps = {
  isOpen: boolean
  onClose: () => void
  property: PortfolioProperty
  /** Called after a successful save so parent can refresh portfolio data. */
  onSaved: () => void
}

export default function EditBuildingModal({ isOpen, onClose, property, onSaved }: EditBuildingModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [addressRange, setAddressRange] = useState('')
  const [additionalStreets, setAdditionalStreets] = useState<string[]>([])
  const [unitsOverride, setUnitsOverride] = useState('')
  const [sqftOverride, setSqftOverride] = useState('')
  const [yearBuilt, setYearBuilt] = useState('')
  const [propertyClass, setPropertyClass] = useState('')
  const [impliedValue, setImpliedValue] = useState('')
  const [communityArea, setCommunityArea] = useState('')
  const [notes, setNotes] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(false)

  // Resync on open and whenever the underlying property changes (e.g., after a prior save)
  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setDisplayName(property.display_name ?? formatAddressForDisplay(property.canonical_address))
    setAddressRange(property.address_range ?? '')
    setAdditionalStreets(property.additional_streets ? [...property.additional_streets] : [])
    setUnitsOverride(property.units_override != null ? String(property.units_override) : '')
    setSqftOverride(
      property.sqft_override != null && Number.isFinite(property.sqft_override)
        ? property.sqft_override.toLocaleString('en-US')
        : ''
    )
    const yb = (property.building_chars as { year_built?: number | string | null } | undefined)?.year_built
    setYearBuilt(yb != null && String(yb).trim() !== '' ? String(yb) : '')
    setPropertyClass(property.property_class ?? '')
    setImpliedValue(
      property.implied_value != null && Number.isFinite(property.implied_value)
        ? property.implied_value.toLocaleString('en-US')
        : ''
    )
    setCommunityArea(property.community_area ?? '')
    setNotes(property.notes ?? '')
    setAlertsEnabled(Boolean(property.alerts_enabled))
  }, [isOpen, property])

  // Esc closes
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, saving])

  const handleAddStreet = () => setAdditionalStreets([...additionalStreets, ''])
  const handleRemoveStreet = (i: number) => setAdditionalStreets(additionalStreets.filter((_, idx) => idx !== i))
  const handleUpdateStreet = (i: number, v: string) => {
    const next = [...additionalStreets]
    next[i] = v
    setAdditionalStreets(next)
  }

  const handleSave = async () => {
    if (!displayName.trim()) return
    setSaving(true)
    setError(null)

    const parseIntOrNull = (s: string): number | null => {
      const cleaned = s.replace(/[,$]/g, '').trim()
      if (!cleaned) return null
      const n = parseInt(cleaned, 10)
      return Number.isFinite(n) ? n : null
    }

    try {
      const res = await fetch('/api/dashboard/property/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          patch: {
            display_name: displayName.trim() || null,
            address_range: addressRange.trim() || null,
            additional_streets: additionalStreets.map((s) => s.trim()).filter(Boolean),
            units_override: parseIntOrNull(unitsOverride),
            sqft_override: parseIntOrNull(sqftOverride),
            year_built: yearBuilt.trim() || null,
            property_class: propertyClass.trim() || null,
            implied_value: parseIntOrNull(impliedValue),
            community_area: communityArea.trim() || null,
            notes: notes.trim() || null,
            alerts_enabled: alertsEnabled,
          },
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || 'Failed to save')
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null
  if (typeof window === 'undefined') return null

  const saveDisabled = saving || !displayName.trim()

  return createPortal(
    <div className="save-modal-backdrop" onClick={() => !saving && onClose()} role="presentation">
      <div
        className="save-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="edit-modal-title"
        aria-modal="true"
      >
        <div className="save-modal-header">
          <div>
            <div id="edit-modal-title" className="save-modal-title">
              Edit building details
            </div>
            <div className="save-modal-sub">{formatAddressForDisplay(property.canonical_address)}</div>
          </div>
          <button
            type="button"
            className="save-modal-close"
            onClick={() => onClose()}
            aria-label="Close"
            disabled={saving}
          >
            &times;
          </button>
        </div>

        <div className="save-modal-body">
          <div className="save-field">
            <label className="save-field-label" htmlFor="edit-display-name">
              Property name{' '}
              <span style={{ color: 'var(--red, #c0392b)' }} aria-hidden="true">*</span>
            </label>
            <input
              id="edit-display-name"
              className="save-field-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Hyde Park Tower"
              required
            />
          </div>

          <div className="save-field">
            <label className="save-field-label" htmlFor="edit-address-range">
              Address range
            </label>
            <div className="save-address-row">
              <input
                id="edit-address-range"
                className="save-field-input"
                type="text"
                value={addressRange}
                onChange={(e) => setAddressRange(e.target.value)}
                placeholder="e.g. 5532–5540 S Hyde Park Blvd"
              />
            </div>
            {additionalStreets.map((street, i) => (
              <div className="save-address-row" key={i}>
                <input
                  className="save-field-input"
                  type="text"
                  value={street}
                  onChange={(e) => handleUpdateStreet(i, e.target.value)}
                  placeholder="e.g. 153–163 W Elm St"
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
            <div className="save-field-hint">
              Canonical address ({formatAddressForDisplay(property.canonical_address)}) cannot be changed — it
              anchors activity feed lookups.
            </div>
          </div>

          <div className="save-divider" />

          <div className="save-field-row">
            <div className="save-field">
              <label className="save-field-label" htmlFor="edit-units">Units</label>
              <input
                id="edit-units"
                className="save-field-input"
                type="text"
                value={unitsOverride}
                onChange={(e) => setUnitsOverride(e.target.value)}
                placeholder="e.g. 18"
              />
            </div>
            <div className="save-field">
              <label className="save-field-label" htmlFor="edit-sqft">Sqft</label>
              <input
                id="edit-sqft"
                className="save-field-input"
                type="text"
                value={sqftOverride}
                onChange={(e) => setSqftOverride(e.target.value)}
                placeholder="e.g. 14,646"
              />
            </div>
          </div>

          <div className="save-field-row">
            <div className="save-field">
              <label className="save-field-label" htmlFor="edit-year-built">Year built</label>
              <input
                id="edit-year-built"
                className="save-field-input"
                type="text"
                value={yearBuilt}
                onChange={(e) => setYearBuilt(e.target.value)}
                placeholder="e.g. 1925"
              />
            </div>
            <div className="save-field">
              <label className="save-field-label" htmlFor="edit-property-class">Property class</label>
              <input
                id="edit-property-class"
                className="save-field-input"
                type="text"
                value={propertyClass}
                onChange={(e) => setPropertyClass(e.target.value)}
                placeholder="e.g. 299"
              />
            </div>
          </div>

          <div className="save-field-row">
            <div className="save-field">
              <label className="save-field-label" htmlFor="edit-implied-value">Implied valuation</label>
              <input
                id="edit-implied-value"
                className="save-field-input"
                type="text"
                value={impliedValue}
                onChange={(e) => setImpliedValue(e.target.value)}
                placeholder="e.g. 127,100"
              />
            </div>
            <div className="save-field">
              <label className="save-field-label" htmlFor="edit-community-area">Neighborhood</label>
              <input
                id="edit-community-area"
                className="save-field-input"
                type="text"
                value={communityArea}
                onChange={(e) => setCommunityArea(e.target.value)}
                placeholder="e.g. ROGERS PARK"
              />
            </div>
          </div>

          <div className="save-divider" />

          <div className="save-field">
            <label className="save-field-label" htmlFor="edit-notes">Notes</label>
            <textarea
              id="edit-notes"
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
          <button
            type="button"
            className="save-btn save-btn-cancel"
            onClick={() => onClose()}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="save-btn save-btn-save"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
