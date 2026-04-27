'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Optional override of the headline. Defaults to the generic premium message. */
  title?: string
  /** Optional override of the subtext. Defaults to the standard contact-Jim message. */
  body?: string
}

/**
 * Generic "this feature is part of premium services" upsell modal.
 * Used on public audit pages whenever a non-customer interacts with a
 * gated surface (monitoring CTA, add-property CTA, STR listings count).
 *
 * Reuses the same .building-modal CSS classes as BuildingDetectionModal
 * so the visual treatment is consistent across the app.
 */
export default function UpgradeModal({ isOpen, onClose, title, body }: Props) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen || typeof window === 'undefined') return null

  const headline = title ?? 'This feature is part of Property Sentinel premium'
  const subtext =
    body ??
    'Real-time alerts, full address details, and adding properties to a live portfolio are available to subscribers. If you received this audit by email, just reply to it — or contact jim@propertysentinel.io to get set up.'

  return createPortal(
    <div className="building-modal-overlay" onClick={onClose}>
      <div
        className="building-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="building-modal-x"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        <div className="building-modal-icon building-modal-icon-amber">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d97706"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2l2.39 7.36H22l-6.19 4.5L18.2 21 12 16.5 5.8 21l2.39-7.14L2 9.36h7.61L12 2z" />
          </svg>
        </div>
        <div className="building-modal-title" id="upgrade-modal-title">
          {headline}
        </div>
        <div className="building-modal-subtitle">{subtext}</div>
        <div className="building-modal-buttons" style={{ marginTop: 16 }}>
          <a
            href="mailto:jim@propertysentinel.io?subject=Property%20Sentinel%20premium%20inquiry"
            className="building-modal-btn building-modal-btn-amber"
          >
            Contact us
          </a>
          <button
            type="button"
            className="building-modal-btn building-modal-btn-outline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
