'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PortfolioProperty } from './types'

type Props = {
  isOpen: boolean
  onClose: (created?: boolean) => void
  selectedProperties: PortfolioProperty[]
}

function slugify(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

export default function CreateAuditModal({ isOpen, onClose, selectedProperties }: Props) {
  const [pmName, setPmName] = useState('')
  const [slug, setSlug] = useState('')
  const [expiry, setExpiry] = useState('14')
  const [email, setEmail] = useState('jim@propertysentinel.io')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slugManualRef = useRef(false)

  const slugValue = slugify(slug)

  const handleCreate = async () => {
    if (!slugValue || selectedProperties.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/audit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slugValue,
          pm_company_name: pmName.trim() || null,
          contact_email: email.trim() || null,
          internal_notes: notes.trim() || null,
          expires_days: expiry === 'never' ? null : parseInt(expiry, 10),
          property_ids: selectedProperties.map((p) => p.id),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Failed to create audit')
      }
      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div className="save-modal-backdrop" onClick={() => onClose()} role="presentation">
      <div
        className="audit-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="audit-modal-head">
          <div>
            <div className="audit-modal-kicker">New portfolio audit</div>
            <div className="audit-modal-title">Create audit</div>
          </div>
          <button type="button" className="audit-modal-close" onClick={() => onClose()} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="audit-modal-body">
          <div className="audit-props-section">
            <div className="audit-props-label">Properties included ({selectedProperties.length})</div>
            <div className="audit-props-list">
              {selectedProperties.map((p) => (
                <div key={p.id} className="audit-prop-item">
                  <span className="audit-prop-addr">{p.display_name || p.canonical_address}</span>
                  <span className="audit-prop-hood">{p.community_area || ''}</span>
                </div>
              ))}
            </div>
          </div>

          <hr className="audit-divider" />

          <div className="audit-field">
            <label className="audit-field-label" htmlFor="audit-pm-name">
              Property management company
            </label>
            <input
              id="audit-pm-name"
              type="text"
              value={pmName}
              onChange={(e) => {
                const v = e.target.value
                setPmName(v)
                if (!slugManualRef.current) {
                  setSlug(slugify(v))
                }
              }}
              placeholder="e.g. Streeterville Realty"
            />
          </div>

          <div className="audit-field-row">
            <div className="audit-field">
              <label className="audit-field-label" htmlFor="audit-expiry">
                Audit expires
              </label>
              <select id="audit-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="never">Never (permanent)</option>
              </select>
              <div className="audit-field-hint">Public link deactivates after this period</div>
            </div>
            <div className="audit-field">
              <label className="audit-field-label" htmlFor="audit-email">
                Contact email
              </label>
              <input id="audit-email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="audit-field">
            <label className="audit-field-label" htmlFor="audit-slug">
              Audit URL slug
            </label>
            <input
              id="audit-slug"
              type="text"
              value={slug}
              onChange={(e) => {
                slugManualRef.current = true
                setSlug(e.target.value)
              }}
              placeholder="e.g. streeterville-realty"
            />
            <div className="audit-slug-preview">propertysentinel.io/audit/{slugValue || 'your-slug'}</div>
          </div>

          <hr className="audit-divider" />

          <div className="audit-field">
            <label className="audit-field-label" htmlFor="audit-notes">
              Internal notes (not shown to recipient)
            </label>
            <input
              id="audit-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Sent via cold email Apr 2026"
            />
          </div>

          {error ? <div className="audit-error">{error}</div> : null}
        </div>

        <div className="audit-modal-footer">
          <button type="button" className="audit-btn-cancel" onClick={() => onClose()}>
            Cancel
          </button>
          <button
            type="button"
            className="audit-btn-create"
            onClick={() => void handleCreate()}
            disabled={saving || !slugValue}
          >
            {saving ? 'Creating...' : 'Create audit →'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
